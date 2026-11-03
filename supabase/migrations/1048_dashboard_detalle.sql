-- Resto del inicio del admin (antes vacío): `dashboard_detalle()`, solo backoffice.
--
-- - volumen_14d: por día (zona horaria del país de la instalación), monto y cantidad de las
--   transacciones contabilizadas en su moneda; los 14 días, también los que no tuvieron
--   movimiento.
-- - estado_sistema: conexión de cada proveedor activo (última prueba) y las tareas programadas
--   con su última corrida y si están atrasadas (pendientes cada 5 min: atrasada a los 15;
--   conciliaciones diarias: a las 26 h; el simulador de Cobre cada minuto: a los 5).
-- - ultimos_registros: los 6 clientes más nuevos con su volumen del mes.
-- - alertas_recientes: las 5 alertas sin resolver más nuevas.
-- - cobros_mes: cobros de Ecart Pay del mes (pagados): bruto, comisión del proveedor, neto,
--   reembolsado y cantidad por método.
-- Aditiva.

create or replace function public.dashboard_detalle()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_moneda text;
  v_tz text;
  v_hoy date;
  v_mes timestamptz;
begin
  if not public.es_backoffice() then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  select moneda, timezone into v_moneda, v_tz from public.paises where predeterminado limit 1;
  v_moneda := coalesce(v_moneda, 'MXN');
  v_tz := coalesce(v_tz, 'America/Mexico_City');
  v_hoy := (now() at time zone v_tz)::date;
  v_mes := date_trunc('month', now() at time zone v_tz) at time zone v_tz;

  return jsonb_build_object(
    'moneda', v_moneda,
    'volumen_14d', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia::date, 'monto', coalesce(x.monto, 0),
                                                   'operaciones', coalesce(x.n, 0)) order by d.dia), '[]'::jsonb)
        from generate_series(v_hoy - 13, v_hoy, interval '1 day') d(dia)
        left join (
          select (coalesce(t.fecha, t.created_at) at time zone v_tz)::date dia,
                 sum(t.monto_operacion) monto, count(*) n
            from public.transactions t
           where t.ledger_status = 'posted' and t.currency_code = v_moneda
             and coalesce(t.fecha, t.created_at) >= ((v_hoy - 13)::timestamp at time zone v_tz)
           group by 1
        ) x on x.dia = d.dia::date
    ),
    'estado_sistema', (
      select coalesce(jsonb_agg(e order by e ->> 'orden', e ->> 'nombre'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'orden', '1', 'nombre', 'Conexión ' || p.nombre,
                 'ok', p.conexion_estado = 'ok',
                 'detalle', case p.conexion_estado when 'ok' then 'Operativo'
                                 when 'sin_probar' then 'Sin probar' else 'Con error' end,
                 'at', p.conexion_verificada_at) e
          from public.proveedores_pago p where p.activo
        union all
        select jsonb_build_object(
                 'orden', '2',
                 'nombre', case tp.nombre
                   when 'cobre-pendientes' then 'Revisión de pendientes · Cobre'
                   when 'ecartpay-pendientes' then 'Revisión de pendientes · Ecart Pay'
                   when 'cobre-conciliacion' then 'Conciliación diaria · Cobre'
                   when 'ecartpay-conciliacion' then 'Conciliación diaria · Ecart Pay'
                   when 'cobre-simulador' then 'Simulador de Cobre'
                   else tp.nombre end,
                 'ok', tp.ultima_corrida_at is not null and tp.ultima_corrida_at > now() - case
                   when tp.nombre like '%conciliacion' then interval '26 hours'
                   when tp.nombre = 'cobre-simulador' then interval '5 minutes'
                   else interval '15 minutes' end,
                 'detalle', case when tp.ultima_corrida_at is null then 'Nunca corrió' else 'Última corrida' end,
                 'at', tp.ultima_corrida_at)
          from public.tareas_programadas tp
      ) s(e)
    ),
    'ultimos_registros', (
      select coalesce(jsonb_agg(r order by r ->> 'alta' desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'legajo', c.legajo,
                 'nombre', coalesce(nullif(c.nombre_legal, ''), c.nombre),
                 'id_fiscal', coalesce(nullif(c.tax_id, ''), c.cuit),
                 'tipo_persona', c.tipo_persona,
                 'estado', c.estado,
                 'alta', c.created_at,
                 'volumen_mes', (select coalesce(sum(t.monto_operacion), 0) from public.transactions t
                                  where t.legajo = c.legajo and t.ledger_status = 'posted'
                                    and t.currency_code = v_moneda
                                    and coalesce(t.fecha, t.created_at) >= v_mes)) r
          from public.clientes c
         where c.estado <> 'eliminado'
         order by c.created_at desc
         limit 6
      ) s
    ),
    'alertas_recientes', (
      select coalesce(jsonb_agg(a order by a ->> 'at' desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', al.id,
                 'titulo', coalesce(r.name, al.type),
                 'descripcion', al.description,
                 'cliente', coalesce(nullif(c.nombre_legal, ''), c.nombre),
                 'estado', al.status,
                 'vencida', al.due_at is not null and al.due_at < now(),
                 'at', al.created_at) a
          from public.alerts al
          left join public.alert_rules r on r.id = al.rule_id
          left join public.clientes c on c.id = al.client_id
         where al.status in ('pending', 'in_review')
         order by al.created_at desc
         limit 5
      ) s
    ),
    'cobros_mes', (
      select jsonb_build_object(
               'cantidad', count(*),
               'bruto', coalesce(sum(p.monto), 0),
               'comision_proveedor', coalesce(sum(p.comision_proveedor), 0),
               'neto', coalesce(sum(coalesce(p.neto_proveedor, p.monto - coalesce(p.comision_proveedor, 0))), 0),
               'reembolsado', coalesce(sum(p.monto_reembolsado), 0),
               'conciliados', count(*) filter (where p.conciliado_at is not null),
               'por_metodo', (
                 select coalesce(jsonb_object_agg(m.metodo, jsonb_build_object('cantidad', m.n, 'monto', m.monto)), '{}'::jsonb)
                   from (select coalesce(p2.metodo, 'tarjeta') metodo, count(*) n, sum(p2.monto) monto
                           from public.pagos p2
                          where p2.proveedor = 'ecartpay'
                            and p2.estado in ('pagado', 'reembolsado', 'parcialmente_reembolsado')
                            and coalesce(p2.pagado_at, p2.created_at) >= v_mes
                          group by 1) m))
        from public.pagos p
       where p.proveedor = 'ecartpay'
         and p.estado in ('pagado', 'reembolsado', 'parcialmente_reembolsado')
         and coalesce(p.pagado_at, p.created_at) >= v_mes
    )
  );
end;
$$;

revoke all on function public.dashboard_detalle() from public, anon;
grant execute on function public.dashboard_detalle() to authenticated;
