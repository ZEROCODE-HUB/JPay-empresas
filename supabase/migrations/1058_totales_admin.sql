-- Totales del admin calculados por la base (11/11/2026). Mismas reglas que 1057 (por moneda,
-- solo lo contabilizado, sin tope de filas). Solo backoffice (es_backoffice / exigir_backoffice).

-- ---------------------------------------------------------------------------------------------
-- admin_resumen_cliente: cifras del detalle del cliente (saldo por moneda, movimientos por tipo y
-- conteos reales de comisiones, alertas y bloqueos; antes se contaban listas de 10, 100 o 1000).
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_resumen_cliente(
  p_legajo text,
  p_desde timestamptz default null,
  p_hasta timestamptz default null
) returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_cliente_id uuid;
  r jsonb;
begin
  perform public.exigir_backoffice();
  select id into v_cliente_id from public.clientes where legajo = p_legajo;

  with saldos as (
    select coalesce(s.moneda, 'MXN') moneda, count(*) subcuentas,
           sum(coalesce(b.saldo_disponible, 0)) disponible, sum(coalesce(b.saldo_retenido, 0)) retenido
      from public.subaccounts s
      left join public.subaccount_balances b on b.subaccount_id = s.id
     where s.cliente_legajo = p_legajo
     group by 1
  ),
  movs as (
    select t.tipo, t.currency_code::text moneda
      from public.transactions t
     where t.legajo = p_legajo
       and (p_desde is null or t.fecha >= p_desde)
       and (p_hasta is null or t.fecha <= p_hasta)
  )
  select jsonb_build_object(
    'saldos', coalesce((select jsonb_object_agg(moneda, jsonb_build_object(
        'disponible', disponible, 'retenido', retenido, 'total', disponible + retenido,
        'subcuentas', subcuentas)) from saldos), '{}'::jsonb),
    'subcuentas', (select coalesce(sum(subcuentas), 0) from saldos),
    'movimientos', (select count(*) from movs),
    'movimientos_por_tipo', coalesce((select jsonb_object_agg(tipo, n)
        from (select coalesce(tipo, 'otro') tipo, count(*) n from movs group by 1) x), '{}'::jsonb),
    'comisiones', (select count(*) from public.comisiones_cliente c where c.cliente_id = v_cliente_id),
    'alertas', (select count(*) from public.v_alerts a where a.legajo = p_legajo),
    'bloqueos', (select count(*) from public.v_account_blocks b where b.legajo = p_legajo)
  ) into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- admin_comisiones_dashboard: tarjeta «Comisiones» del Dashboard. Depósitos, envíos y conversiones
-- contabilizados del período, por moneda y por cliente (antes: 1000 filas por tipo, todos los
-- estados y monedas mezcladas).
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_comisiones_dashboard(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_tz text;
  v_ini timestamptz;
  v_fin timestamptz;
  r jsonb;
begin
  perform public.exigir_backoffice();
  if p_hasta < p_desde then
    raise exception 'El período está invertido';
  end if;
  select timezone into v_tz from public.paises where predeterminado limit 1;
  v_tz := coalesce(v_tz, 'America/Mexico_City');
  v_ini := p_desde::timestamp at time zone v_tz;
  v_fin := (p_hasta + 1)::timestamp at time zone v_tz;

  with t as (
    select x.legajo, x.currency_code::text moneda, x.monto_operacion monto, x.comision, x.impuesto
      from public.transactions x
     where x.ledger_status = 'posted'
       and x.tipo in ('deposito', 'transferencia', 'conversion')
       and x.id_txn !~ '-USD$'
       and coalesce(x.fecha, x.created_at) >= v_ini and coalesce(x.fecha, x.created_at) < v_fin
  ),
  por_cliente as (
    select t.moneda, t.legajo, coalesce(nullif(c.nombre_legal, ''), c.nombre, t.legajo) nombre,
           count(*) n, sum(t.monto) monto, sum(t.comision) comision, sum(t.impuesto) iva
      from t left join public.clientes c on c.legajo = t.legajo
     group by 1, 2, 3
  )
  select coalesce(jsonb_object_agg(m.moneda, jsonb_build_object(
      'monto', m.monto, 'comision', m.comision, 'iva', m.iva, 'operaciones', m.n,
      'remanente', m.monto - m.comision,
      'por_cliente', (select jsonb_agg(jsonb_build_object('legajo', legajo, 'nombre', nombre,
                        'monto', monto, 'comision', comision, 'iva', iva, 'operaciones', n)
                        order by monto desc)
                        from por_cliente pc where pc.moneda = m.moneda))), '{}'::jsonb)
    into r
    from (select moneda, count(*) n, sum(monto) monto, sum(comision) comision, sum(impuesto) iva
            from t group by 1) m;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- admin_fondos_totales: total de «Fondos por usuario» por moneda (la lista se pagina aparte).
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_fondos_totales()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  r jsonb;
begin
  perform public.exigir_backoffice();
  select coalesce(jsonb_object_agg(moneda, jsonb_build_object(
           'disponible', disponible, 'retenido', retenido, 'total', disponible + retenido,
           'subcuentas', n, 'clientes', clientes)), '{}'::jsonb)
    into r
    from (select coalesce(s.moneda, 'MXN') moneda, count(*) n, count(distinct s.cliente_legajo) clientes,
                 sum(coalesce(b.saldo_disponible, 0)) disponible, sum(coalesce(b.saldo_retenido, 0)) retenido
            from public.subaccounts s
            left join public.subaccount_balances b on b.subaccount_id = s.id
           group by 1) x;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- comisiones_jpay: + columna `moneda` al final (antes sumaba MXN y USD juntos). Cambia el tipo de
-- retorno, así que se reemplaza en la misma transacción; las mismas filas, separadas por moneda.
-- ---------------------------------------------------------------------------------------------
drop function if exists public.comisiones_jpay(date, date);
create function public.comisiones_jpay(p_desde date, p_hasta date)
 RETURNS TABLE(proveedor text, producto text, cliente_legajo text, cliente_nombre text, operaciones bigint, base numeric, comision numeric, iva numeric, forma text, moneda text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_tz text;
  v_ini timestamptz;
  v_fin timestamptz;
  v_modo text;
begin
  perform public.exigir_backoffice();
  if p_hasta < p_desde then
    raise exception 'El período está invertido';
  end if;
  select timezone into v_tz from public.paises where predeterminado limit 1;
  v_tz := coalesce(v_tz, 'America/Mexico_City');
  v_ini := p_desde::timestamp at time zone v_tz;
  v_fin := (p_hasta + 1)::timestamp at time zone v_tz;
  v_modo := coalesce((select modo_comision from public.cobre_configuracion where id = 1), 'descontar');

  return query
  with cfg as (
    select coalesce(cp.comision_pct, 0) pct, coalesce(cp.comision_fija, 0) fija,
           coalesce(cp.iva_comision_pct, 16) iva, coalesce(cp.comision_suscripcion_pct, 0) pct_sus,
           coalesce(cp.comision_domiciliacion_pct, 0) pct_dom
      from public.configuracion_pagos cp
     where cp.pais = 'MX' and cp.proveedor = 'ecartpay'
     limit 1
  ),
  pagos_ecart as (
    select p.cliente_legajo, case when p.caja_id is null then 'Enlaces de pago' else 'POS' end producto,
           coalesce(p.moneda, 'MXN') moneda,
           p.monto - coalesce(p.monto_reembolsado, 0) base,
           coalesce(c.comision_pct, (select pct from cfg), 0) pct,
           coalesce(c.comision_fija, (select fija from cfg), 0) fija
      from public.pagos p
      left join public.comercio_proveedores c on c.id = p.conexion_id
     where p.proveedor = 'ecartpay'
       and p.estado in ('pagado', 'reembolsado', 'parcialmente_reembolsado')
       and coalesce(p.pagado_at, p.created_at) >= v_ini and coalesce(p.pagado_at, p.created_at) < v_fin
  ),
  recurrentes as (
    select r.cliente_legajo,
           case r.tipo when 'suscripcion' then 'Suscripciones' else 'Domiciliación' end producto,
           coalesce(r.moneda, 'MXN') moneda,
           r.monto base,
           case r.tipo when 'suscripcion' then (select pct_sus from cfg) else (select pct_dom from cfg) end pct
      from public.cobros_recurrentes r
     where r.estado = 'pagado' and r.cobrado_at >= v_ini and r.cobrado_at < v_fin
  ),
  ecart as (
    select 'ecartpay'::text proveedor, x.producto, x.cliente_legajo, x.moneda, count(*) ops, sum(x.base) base,
           round(sum(x.base * x.pct / 100 + x.fija), 2) comision
      from pagos_ecart x group by 2, 3, 4
    union all
    select 'ecartpay', y.producto, y.cliente_legajo, y.moneda, count(*), sum(y.base), round(sum(y.base * y.pct / 100), 2)
      from recurrentes y group by 2, 3, 4
  ),
  cobre_tx as (
    select t.legajo, t.cliente_id, t.subcuenta_id, t.monto_operacion, t.comision, t.impuesto,
           t.currency_code::text moneda,
           case t.tipo when 'deposito' then 'Depósito' when 'transferencia' then 'Retiro' else 'Conversión' end tipo_com,
           case t.tipo when 'deposito' then 'Pay-in (depósitos)' when 'transferencia' then 'Pay-out (transferencias)'
                       else 'Conversión a dólares' end producto
      from public.transactions t
      join public.clientes cl on cl.id = t.cliente_id and cl.pais = 'MX'
     where t.ledger_status = 'posted'
       and t.tipo in ('deposito', 'transferencia', 'conversion')
       and t.id_txn !~ '-USD$'
       and t.currency_code in ('MXN', 'USD')
       and coalesce(t.fecha, t.created_at) >= v_ini and coalesce(t.fecha, t.created_at) < v_fin
  ),
  cobre as (
    select z.legajo, z.producto, z.moneda, z.monto_operacion,
           case when z.comision + z.impuesto > 0 then z.comision
                when v_modo = 'calcular' then (select k.comision from public.comision_teorica(z.cliente_id, z.monto_operacion, z.subcuenta_id, z.tipo_com) k)
                else 0 end comision,
           case when z.comision + z.impuesto > 0 then z.impuesto
                when v_modo = 'calcular' then (select k.impuesto from public.comision_teorica(z.cliente_id, z.monto_operacion, z.subcuenta_id, z.tipo_com) k)
                else 0 end iva,
           case when z.comision + z.impuesto > 0 then 'descontada' else 'por_cobrar' end forma
      from cobre_tx z
  )
  select e.proveedor, e.producto, e.cliente_legajo, coalesce(nullif(cl.nombre_legal, ''), cl.nombre),
         e.ops, e.base, e.comision, round(e.comision * (select iva from cfg) / 100, 2), 'por_cobrar'::text, e.moneda
    from ecart e left join public.clientes cl on cl.legajo = e.cliente_legajo
  union all
  select 'cobre', c.producto, c.legajo, coalesce(nullif(cl.nombre_legal, ''), cl.nombre),
         count(*), sum(c.monto_operacion), sum(c.comision), sum(c.iva), c.forma, c.moneda
    from cobre c left join public.clientes cl on cl.legajo = c.legajo
   where c.comision > 0
   group by c.producto, c.legajo, cl.nombre_legal, cl.nombre, c.forma, c.moneda
   order by 1, 3, 2;
end;
$function$;

revoke all on function public.comisiones_jpay(date, date) from public, anon;
revoke all on function public.admin_resumen_cliente(text, timestamptz, timestamptz) from public, anon;
revoke all on function public.admin_comisiones_dashboard(date, date) from public, anon;
revoke all on function public.admin_fondos_totales() from public, anon;
grant execute on function public.comisiones_jpay(date, date) to authenticated, service_role;
grant execute on function public.admin_resumen_cliente(text, timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_comisiones_dashboard(date, date) to authenticated;
grant execute on function public.admin_fondos_totales() to authenticated;
