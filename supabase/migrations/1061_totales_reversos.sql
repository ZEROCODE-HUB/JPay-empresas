-- Totales del portal: un asiento de reverso (reversal_of_entry_id) se clasifica con la categoría
-- del asiento que anula. Antes, la limpieza del simulador (posting_key «limpieza_simulador») caía
-- en «ajuste» y no se compensaba con el depósito/envío original: el Inicio mostraba depósitos y
-- salidas de operaciones ya anuladas aunque el saldo fuera 0.

CREATE OR REPLACE FUNCTION public.portal_resumen_periodo(p_desde timestamp with time zone, p_hasta timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_legajo text := public.current_cliente_legajo();
  v_tz text;
  r jsonb;
begin
  if v_legajo is null then
    raise exception 'Cliente no encontrado' using errcode = '42501';
  end if;
  if p_hasta < p_desde then
    raise exception 'El período está invertido';
  end if;
  select timezone into v_tz from public.paises where predeterminado limit 1;
  v_tz := coalesce(v_tz, 'America/Mexico_City');

  with subs as (
    select s.id, coalesce(s.moneda, 'MXN') moneda
      from public.subaccounts s where s.cliente_legajo = v_legajo
  ),
  saldos as (
    select subs.moneda, count(*) cuentas,
           sum(coalesce(b.saldo_disponible, 0)) disponible, sum(coalesce(b.saldo_retenido, 0)) retenido
      from subs left join public.subaccount_balances b on b.subaccount_id = subs.id
     group by 1
  ),
  -- Asientos efectivos del cliente (sin reservas), netos por operación y categoría.
  ops as (
    select t.id tx, e.currency_code::text moneda,
           public._categoria_movimiento(t.tipo, coalesce(orig.concepto, e.concepto), coalesce(orig.posting_key, e.posting_key), e.currency_code::text) categoria,
           coalesce(t.fecha, t.created_at) fecha,
           sum(case when e.entry_type = 'credit' then e.amount else -e.amount end) neto
      from public.ledger_entries e
      join public.ledger_accounts a on a.id = e.account_id
      join subs on subs.id = a.subaccount_id
      join public.transactions t on t.id = e.transaction_id
      left join public.ledger_entries orig on orig.id = e.reversal_of_entry_id
     where e.concepto <> 'reserva'
       and coalesce(t.fecha, t.created_at) between p_desde and p_hasta
     group by 1, 2, 3, 4
    having sum(case when e.entry_type = 'credit' then e.amount else -e.amount end) <> 0
  ),
  principales as (select * from ops where categoria not in ('comision', 'iva', 'interna')),
  por_moneda as (
    select m.moneda,
           coalesce((select sum(neto) from principales p where p.moneda = m.moneda and neto > 0), 0) entradas,
           (select count(distinct tx) from principales p where p.moneda = m.moneda and neto > 0) ops_entradas,
           coalesce((select -sum(neto) from principales p where p.moneda = m.moneda and neto < 0), 0) salidas,
           (select count(distinct tx) from principales p where p.moneda = m.moneda and neto < 0) ops_salidas,
           coalesce((select -sum(neto) from ops o where o.moneda = m.moneda and categoria = 'comision'), 0) comisiones,
           coalesce((select -sum(neto) from ops o where o.moneda = m.moneda and categoria = 'iva'), 0) iva,
           coalesce((select jsonb_object_agg(categoria, jsonb_build_object('monto', monto, 'ops', n))
                       from (select categoria, sum(neto) monto, count(distinct tx) n
                               from ops o where o.moneda = m.moneda group by 1) x), '{}'::jsonb) por_categoria
      from (select moneda from saldos union select moneda from ops) m
  ),
  pendientes as (
    select t.currency_code::text moneda, count(*) n, sum(t.monto_operacion + t.comision + t.impuesto) monto
      from public.transactions t
     where t.legajo = v_legajo and t.ledger_status = 'reserved'
     group by 1
  ),
  rechazados as (
    select t.currency_code::text moneda, count(*) n, sum(t.monto_operacion) monto
      from public.transactions t
      join public.estados_movimiento em on em.id = t.estado_id and em.codigo = 'RECHAZADO'
     where t.legajo = v_legajo and coalesce(t.fecha, t.created_at) between p_desde and p_hasta
     group by 1
  ),
  -- Cobros con tarjeta (links y POS): no pasan por las subcuentas, se leen de `pagos`.
  tarjeta as (
    select p.entorno, p.moneda, count(*) n, sum(p.monto - coalesce(p.monto_reembolsado, 0)) monto
      from public.pagos p
     where p.cliente_legajo = v_legajo
       and p.estado in ('pagado', 'reembolsado', 'parcialmente_reembolsado')
       and coalesce(p.pagado_at, p.created_at) between p_desde and p_hasta
     group by 1, 2
  ),
  serie as (
    select (o.fecha at time zone v_tz)::date dia, o.moneda,
           sum(case when o.categoria = 'deposito' and o.neto > 0 then o.neto else 0 end) depositos,
           sum(case when o.categoria not in ('comision', 'iva', 'interna') and o.neto > 0 then o.neto else 0 end) entradas,
           sum(case when o.categoria not in ('comision', 'iva', 'interna') and o.neto < 0 then -o.neto else 0 end) salidas
      from ops o group by 1, 2
  ),
  serie_tarjeta as (
    select (coalesce(p.pagado_at, p.created_at) at time zone v_tz)::date dia, p.entorno, p.moneda,
           sum(p.monto - coalesce(p.monto_reembolsado, 0)) monto
      from public.pagos p
     where p.cliente_legajo = v_legajo
       and p.estado in ('pagado', 'reembolsado', 'parcialmente_reembolsado')
       and coalesce(p.pagado_at, p.created_at) between p_desde and p_hasta
     group by 1, 2, 3
  )
  select jsonb_build_object(
    'zona_horaria', v_tz,
    'cuentas', (select coalesce(sum(cuentas), 0) from saldos),
    'monedas', coalesce((
      select jsonb_object_agg(pm.moneda, jsonb_build_object(
        'saldo', coalesce(s.disponible + s.retenido, 0),
        'disponible', coalesce(s.disponible, 0),
        'retenido', coalesce(s.retenido, 0),
        'cuentas', coalesce(s.cuentas, 0),
        'entradas', pm.entradas, 'ops_entradas', pm.ops_entradas,
        'salidas', pm.salidas, 'ops_salidas', pm.ops_salidas,
        'comisiones', pm.comisiones, 'iva', pm.iva,
        'por_categoria', pm.por_categoria,
        'pendiente', coalesce(pe.monto, 0), 'ops_pendientes', coalesce(pe.n, 0),
        'rechazado', coalesce(re.monto, 0), 'ops_rechazadas', coalesce(re.n, 0)))
        from por_moneda pm
        left join saldos s on s.moneda = pm.moneda
        left join pendientes pe on pe.moneda = pm.moneda
        left join rechazados re on re.moneda = pm.moneda), '{}'::jsonb),
    'cobros_tarjeta', coalesce((
      select jsonb_agg(jsonb_build_object('entorno', entorno, 'moneda', moneda, 'monto', monto, 'ops', n))
        from tarjeta), '[]'::jsonb),
    'serie', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'moneda', moneda, 'depositos', depositos,
                                          'entradas', entradas, 'salidas', salidas) order by dia)
        from serie), '[]'::jsonb),
    'serie_tarjeta', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'entorno', entorno, 'moneda', moneda, 'monto', monto)
                       order by dia)
        from serie_tarjeta), '[]'::jsonb)
  ) into r;
  return r;
end;
$function$;

CREATE OR REPLACE FUNCTION public.portal_detalle_subcuenta(p_subaccount_id uuid, p_limite integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
           public._categoria_movimiento(t.tipo, coalesce(orig.concepto, e.concepto), coalesce(orig.posting_key, e.posting_key), e.currency_code::text) categoria,
           e.concepto,
           case when e.entry_type = 'credit' then e.amount else -e.amount end monto
      from public.ledger_entries e
      join public.ledger_accounts a on a.id = e.account_id and a.subaccount_id = p_subaccount_id
      join public.transactions t on t.id = e.transaction_id
      left join public.ledger_entries orig on orig.id = e.reversal_of_entry_id
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
$function$;
