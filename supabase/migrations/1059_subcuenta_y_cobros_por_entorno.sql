-- Totales por moneda y sin mezclar cobros de prueba (11/11/2026). Aditiva.
--  * portal_detalle_subcuenta: movimientos y totales de UNA subcuenta con el signo del asiento
--    (antes: 200 operaciones, la conversión contaba como depósito y la transferencia interna
--    recibida como retiro).
--  * reporte_cobros_proveedor y dashboard_detalle («Cobros del mes»): solo la moneda del país y
--    un solo entorno (los reales si hay; si no, los de prueba). Se agregan 'moneda' y 'entorno'
--    a la respuesta; el resto queda igual.

create or replace function public.portal_detalle_subcuenta(p_subaccount_id uuid, p_limite int default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_legajo text := public.current_cliente_legajo();
  v_moneda text;
  r jsonb;
begin
  select coalesce(s.moneda, 'MXN') into v_moneda
    from public.subaccounts s where s.id = p_subaccount_id and s.cliente_legajo = v_legajo;
  if v_moneda is null then
    raise exception 'Subcuenta no encontrada' using errcode = '42501';
  end if;

  with lineas as (
    select t.id tx, t.id_txn, t.tipo, t.cvu, t.destinatario_nombre, coalesce(t.fecha, t.created_at) fecha,
           em.codigo estado,
           public._categoria_movimiento(t.tipo, e.concepto, e.posting_key, e.currency_code::text) categoria,
           e.concepto,
           case when e.entry_type = 'credit' then e.amount else -e.amount end monto
      from public.ledger_entries e
      join public.ledger_accounts a on a.id = e.account_id and a.subaccount_id = p_subaccount_id
      join public.transactions t on t.id = e.transaction_id
      left join public.estados_movimiento em on em.id = t.estado_id
     where e.concepto <> 'reserva'
  ),
  -- Una fila por operación: lo principal neto (sin comisión ni IVA) y lo cobrado aparte.
  ops as (
    select tx, id_txn, tipo, cvu, destinatario_nombre, fecha, estado,
           min(categoria) filter (where concepto = 'principal') categoria,
           coalesce(sum(monto) filter (where concepto = 'principal'), 0) principal,
           coalesce(-sum(monto) filter (where concepto = 'comision'), 0) comision,
           coalesce(-sum(monto) filter (where concepto in ('impuesto', 'interes')), 0) iva
      from lineas group by 1, 2, 3, 4, 5, 6, 7
  )
  select jsonb_build_object(
    'moneda', v_moneda,
    'totales', (select jsonb_build_object(
        'entradas', coalesce(sum(principal) filter (where principal > 0), 0),
        'ops_entradas', count(*) filter (where principal > 0),
        'salidas', coalesce(-sum(principal) filter (where principal < 0), 0),
        'ops_salidas', count(*) filter (where principal < 0),
        'comisiones', coalesce(sum(comision), 0),
        'iva', coalesce(sum(iva), 0)) from ops),
    'pendiente', (select coalesce(sum(t.monto_operacion + t.comision + t.impuesto), 0)
                    from public.transactions t
                   where t.subcuenta_id = p_subaccount_id and t.ledger_status = 'reserved'),
    'movimientos', coalesce((select jsonb_agg(jsonb_build_object(
        'id_txn', id_txn, 'tipo', tipo, 'categoria', categoria, 'cvu', cvu,
        'contraparte', destinatario_nombre, 'fecha', fecha, 'estado', estado,
        'monto', principal, 'comision', comision, 'iva', iva) order by fecha desc)
        from (select * from ops where principal <> 0 order by fecha desc limit greatest(p_limite, 1)) x),
        '[]'::jsonb)
  ) into r;
  return r;
end;
$$;

revoke all on function public.portal_detalle_subcuenta(uuid, int) from public, anon;
grant execute on function public.portal_detalle_subcuenta(uuid, int) to authenticated;

CREATE OR REPLACE FUNCTION public.reporte_cobros_proveedor(p_desde date, p_hasta date, p_comercio_id uuid DEFAULT NULL::uuid, p_proveedor text DEFAULT 'ecartpay'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_tz text := coalesce(
    (select timezone from public.paises where predeterminado limit 1), 'UTC'
  );
  v_ini timestamptz;
  v_fin timestamptz;
  v jsonb;
  v_moneda text;
  v_entorno text;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > 366 then
    raise exception 'El período no puede superar un año' using errcode = '22023';
  end if;
  v_ini := p_desde::timestamp at time zone v_tz;
  v_fin := (p_hasta + 1)::timestamp at time zone v_tz;
  v_moneda := coalesce((select moneda from public.paises where predeterminado limit 1), 'MXN');
  -- Cobros reales si hay alguno en el período; si no, los de prueba. Nunca se suman los dos.
  v_entorno := case when exists (
      select 1 from public.pagos p
       where p.proveedor = p_proveedor and p.entorno <> 'sandbox'
         and coalesce(p.pagado_at, p.created_at) >= v_ini and coalesce(p.pagado_at, p.created_at) < v_fin
         and (p_comercio_id is null or p.comercio_id = p_comercio_id))
    then 'produccion' else 'sandbox' end;

  with cobrados as (
    select
      p.id, p.comercio_id, p.metodo, p.monto, p.monto_reembolsado, p.comision_proveedor,
      p.neto_proveedor, p.conciliado_at, p.pagado_at, p.pagador_nombre, p.pagador_email, p.proveedor_orden_id,
      p.caja_id, c.nombre as caja, s.id as sucursal_id, s.nombre as sucursal,
      co.nombre_comercio as comercio,
      (p.pagado_at at time zone v_tz)::date as fecha
    from public.pagos p
    left join public.cajas c on c.id = p.caja_id
    left join public.sucursales s on s.id = c.sucursal_id
    left join public.comercios co on co.id = p.comercio_id
    where p.proveedor = p_proveedor
      and p.estado in ('pagado', 'reembolsado', 'parcialmente_reembolsado')
      and p.pagado_at >= v_ini and p.pagado_at < v_fin
      and (p_comercio_id is null or p.comercio_id = p_comercio_id)
      and (case when v_entorno = 'sandbox' then p.entorno = 'sandbox' else p.entorno <> 'sandbox' end) and coalesce(p.moneda, v_moneda) = v_moneda
  ),
  reemb as (
    select r.monto, (r.finalizado_at at time zone v_tz)::date as fecha
    from public.reembolsos r
    join public.pagos p on p.id = r.pago_id
    where r.proveedor = p_proveedor
      and r.estado = 'aprobado'
      and r.finalizado_at >= v_ini and r.finalizado_at < v_fin
      and (p_comercio_id is null or p.comercio_id = p_comercio_id)
      and (case when v_entorno = 'sandbox' then p.entorno = 'sandbox' else p.entorno <> 'sandbox' end) and coalesce(p.moneda, v_moneda) = v_moneda
  ),
  contra as (
    select cc.monto, cc.estado
    from public.contracargos_proveedor cc
    left join public.pagos p on p.id = cc.pago_id
    where cc.proveedor = p_proveedor
      and cc.created_at >= v_ini and cc.created_at < v_fin
      and (p_comercio_id is null or p.comercio_id = p_comercio_id)
      and (p.id is null or ((case when v_entorno = 'sandbox' then p.entorno = 'sandbox' else p.entorno <> 'sandbox' end) and coalesce(p.moneda, v_moneda) = v_moneda))
  ),
  pendientes as (
    select p.monto
    from public.pagos p
    where p.proveedor = p_proveedor
      and p.estado in ('creado', 'pendiente')
      and p.created_at >= v_ini and p.created_at < v_fin
      and (p_comercio_id is null or p.comercio_id = p_comercio_id)
      and (case when v_entorno = 'sandbox' then p.entorno = 'sandbox' else p.entorno <> 'sandbox' end) and coalesce(p.moneda, v_moneda) = v_moneda
  ),
  dias as (
    select d::date as fecha
    from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') d
  )
  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'timezone', v_tz,
    'moneda', v_moneda,
    'entorno', v_entorno,
    'resumen', jsonb_build_object(
      'cantidad', (select count(*) from cobrados),
      'cobrado', (select coalesce(sum(monto), 0) from cobrados),
      'comision', (select coalesce(sum(comision_proveedor), 0) from cobrados),
      'neto', (select coalesce(sum(neto_proveedor), 0) from cobrados),
      'sin_conciliar', (select count(*) from cobrados where conciliado_at is null),
      'reembolsado', (select coalesce(sum(monto), 0) from reemb),
      'reembolsos', (select count(*) from reemb),
      'contracargos', (select count(*) from contra),
      'contracargos_monto', (select coalesce(sum(monto), 0) from contra),
      'contracargos_abiertos',
        (select count(*) from contra where estado in ('created', 'pending', 'in_review')),
      'pendientes', (select count(*) from pendientes),
      'pendientes_monto', (select coalesce(sum(monto), 0) from pendientes)
    ),
    'por_dia', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'fecha', d.fecha,
        'cantidad', (select count(*) from cobrados c where c.fecha = d.fecha),
        'monto', (select coalesce(sum(c.monto), 0) from cobrados c where c.fecha = d.fecha),
        'comision',
          (select coalesce(sum(c.comision_proveedor), 0) from cobrados c where c.fecha = d.fecha),
        'reembolsado', (select coalesce(sum(r.monto), 0) from reemb r where r.fecha = d.fecha)
      ) order by d.fecha), '[]'::jsonb)
      from dias d
    ),
    'por_metodo', (
      select coalesce(jsonb_agg(x order by (x->>'monto')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'metodo', coalesce(metodo, 'card'),
          'cantidad', count(*),
          'monto', sum(monto),
          'comision', coalesce(sum(comision_proveedor), 0),
          'reembolsado', sum(monto_reembolsado)
        ) as x
        from cobrados group by coalesce(metodo, 'card')
      ) t
    ),
    'por_sucursal', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object(
          'sucursal_id', sucursal_id,
          'sucursal', sucursal,
          'caja_id', caja_id,
          'caja', caja,
          'cantidad', count(*),
          'monto', sum(monto),
          'comision', coalesce(sum(comision_proveedor), 0)
        ) as x
        from cobrados
        group by sucursal_id, sucursal, caja_id, caja
        order by sucursal nulls first, caja
      ) t
    ),
    'por_comercio', (
      select coalesce(jsonb_agg(x order by (x->>'monto')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'comercio_id', comercio_id,
          'comercio', comercio,
          'cantidad', count(*),
          'monto', sum(monto),
          'comision', coalesce(sum(comision_proveedor), 0),
          'neto', coalesce(sum(neto_proveedor), 0),
          'reembolsado', sum(monto_reembolsado)
        ) as x
        from cobrados group by comercio_id, comercio
      ) t
    ),
    'detalle', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', id,
          'pagado_at', pagado_at,
          'comercio', comercio,
          'metodo', coalesce(metodo, 'card'),
          'monto', monto,
          'comision', comision_proveedor,
          'neto', neto_proveedor,
          'reembolsado', monto_reembolsado,
          'sucursal', sucursal,
          'caja', caja,
          'pagador', coalesce(pagador_nombre, pagador_email),
          'orden', proveedor_orden_id
        ) as x
        from cobrados order by pagado_at desc limit 5000
      ) t
    )
  ) into v;
  return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_detalle()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_moneda text;
  v_tz text;
  v_hoy date;
  v_mes timestamptz;
  v_entorno text;
begin
  if not public.es_backoffice() then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  select moneda, timezone into v_moneda, v_tz from public.paises where predeterminado limit 1;
  v_moneda := coalesce(v_moneda, 'MXN');
  v_tz := coalesce(v_tz, 'America/Mexico_City');
  v_hoy := (now() at time zone v_tz)::date;
  v_mes := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  -- «Cobros del mes»: los reales si hay alguno; si no, los de prueba (nunca juntos). En la moneda
  -- del país.
  v_entorno := case when exists (
      select 1 from public.pagos p
       where p.proveedor = 'ecartpay' and p.entorno <> 'sandbox'
         and coalesce(p.pagado_at, p.created_at) >= v_mes)
    then 'produccion' else 'sandbox' end;

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
               'entorno', v_entorno,
               'moneda', v_moneda,
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
                            and (case when v_entorno = 'sandbox' then p2.entorno = 'sandbox' else p2.entorno <> 'sandbox' end)
                            and coalesce(p2.moneda, v_moneda) = v_moneda
                          group by 1) m))
        from public.pagos p
       where p.proveedor = 'ecartpay'
         and p.estado in ('pagado', 'reembolsado', 'parcialmente_reembolsado')
         and coalesce(p.pagado_at, p.created_at) >= v_mes
         and (case when v_entorno = 'sandbox' then p.entorno = 'sandbox' else p.entorno <> 'sandbox' end) and coalesce(p.moneda, v_moneda) = v_moneda
    )
  );
end;
$function$;
