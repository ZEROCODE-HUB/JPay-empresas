-- Totales del portal calculados por la base (11/11/2026). Aditiva: no cambia cómo se registra el
-- dinero (el libro contable es inmutable), solo cómo se LEE y se SUMA.
--
-- Reglas (PLAN_TOTALES_Y_MONEDAS.txt §3):
--   R1 nunca se suman monedas distintas: todo va por moneda.
--   R2 lo efectivo es lo contabilizado; pendientes y rechazados van aparte.
--   R3 entradas/salidas salen del asiento (crédito/débito a la subcuenta del cliente), netas por
--      operación: un envío que rebota o un depósito revertido no suman en ningún lado.
--   R4 los cobros con tarjeta de prueba (sandbox) no se mezclan con los reales.
--   R5 días en la zona horaria del país (America/Mexico_City).
--   R6 las funciones del portal solo ven al cliente de la sesión (current_cliente_legajo).

-- ---------------------------------------------------------------------------------------------
-- Categoría de un asiento para los desgloses.
-- ---------------------------------------------------------------------------------------------
create or replace function public._categoria_movimiento(
  p_tipo text, p_concepto text, p_posting_key text, p_moneda text
) returns text
language sql
immutable
set search_path to ''
as $$
  select case
    when p_concepto = 'comision' then 'comision'
    when p_concepto in ('impuesto', 'interes') then 'iva'
    when p_posting_key = 'interna' then 'interna'
    when p_posting_key in ('ajuste', 'limpieza_simulador') or p_tipo like 'ajuste%' then 'ajuste'
    when p_tipo = 'deposito' then 'deposito'
    when p_tipo in ('tarjeta', 'cobro_link', 'cobro_pct') then 'cobro_tarjeta'
    when p_tipo = 'conversion' then 'conversion'
    when p_tipo = 'retiro' then 'retiro'
    when p_tipo = 'transferencia' and p_moneda = 'USD' then 'envio_usd'
    when p_tipo = 'transferencia' then 'envio_spei'
    else 'otro'
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- v_transaction_lines: + moneda y categoria (al final) y una línea «pendiente» por cada operación
-- con saldo apartado (ledger_status = 'reserved'). Cuando la operación termina deja de estar
-- 'reserved' y su línea pendiente desaparece: aparecen sus líneas reales, sin duplicar.
-- ---------------------------------------------------------------------------------------------
create or replace view public.v_transaction_lines with (security_invoker = true) as
 SELECT e.id AS line_id,
    t.id AS transaction_id,
    t.id_txn,
    t.legajo,
    t.tipo AS tipo_operacion,
        CASE
            WHEN e.reversal_of_entry_id IS NOT NULL THEN 'reverso'::text
            WHEN e.concepto = 'principal'::text THEN
            CASE
                WHEN e.entry_type = 'credit'::text THEN 'ingreso'::text
                ELSE 'egreso'::text
            END
            ELSE e.concepto
        END AS tipo_linea,
    e.concepto,
        CASE
            WHEN e.entry_type = 'credit'::text THEN e.amount
            ELSE - e.amount
        END::numeric(20,2) AS monto,
    e.posted_at AS fecha,
    e.line_no,
    e.posting_key,
    e.reversal_of_entry_id,
    a.subaccount_id,
    s.cbu AS cvu_propio,
        CASE
            WHEN e.concepto = 'principal'::text THEN COALESCE(cp.cbu, t.cvu)
            ELSE NULL::text
        END AS cvu,
    c.correo AS email,
    c.nombre,
        CASE e.concepto
            WHEN 'principal'::text THEN COALESCE(t.destinatario_nombre, cp.nombre)
            WHEN 'comision'::text THEN c.nombre
            WHEN 'interes'::text THEN c.nombre
            ELSE NULL::text
        END AS nombre_destino,
        CASE e.concepto
            WHEN 'principal'::text THEN t.destinatario_cuit
            WHEN 'comision'::text THEN c.cuit
            WHEN 'interes'::text THEN c.cuit
            ELSE NULL::text
        END AS cuit,
    t.estado_id,
    em.codigo AS estado_codigo,
    em.nombre AS estado_nombre,
    t.comercio_id,
    t.ledger_status,
    e.currency_code::text AS moneda,
    public._categoria_movimiento(t.tipo, e.concepto, e.posting_key, e.currency_code::text) AS categoria
   FROM public.ledger_entries e
     JOIN public.ledger_accounts a ON a.id = e.account_id AND a.subaccount_id IS NOT NULL
     JOIN public.subaccounts s ON s.id = a.subaccount_id
     JOIN public.transactions t ON t.id = e.transaction_id
     LEFT JOIN public.clientes c ON c.id = t.cliente_id
     LEFT JOIN public.estados_movimiento em ON em.id = t.estado_id
     LEFT JOIN LATERAL ( SELECT s2.cbu,
            s2.nombre
           FROM public.ledger_entries e2
             JOIN public.ledger_accounts a2 ON a2.id = e2.account_id AND a2.subaccount_id IS NOT NULL
             JOIN public.subaccounts s2 ON s2.id = a2.subaccount_id
          WHERE e2.transaction_id = e.transaction_id AND e2.posting_key = e.posting_key AND e2.entry_type <> e.entry_type AND e2.concepto = 'principal'::text AND a2.subaccount_id <> a.subaccount_id
          ORDER BY e2.line_no
         LIMIT 1) cp ON e.concepto = 'principal'::text
  WHERE e.concepto <> 'reserva'::text
UNION ALL
 SELECT t.id AS line_id,
    t.id AS transaction_id,
    t.id_txn,
    t.legajo,
    t.tipo AS tipo_operacion,
        CASE l.concepto
            WHEN 'principal'::text THEN
            CASE
                WHEN t.tipo = ANY (ARRAY['deposito'::text, 'cobro_pct'::text, 'tarjeta'::text]) THEN 'ingreso'::text
                ELSE 'egreso'::text
            END
            ELSE l.concepto
        END AS tipo_linea,
    l.concepto,
        CASE l.concepto
            WHEN 'principal'::text THEN
            CASE
                WHEN t.tipo = ANY (ARRAY['deposito'::text, 'cobro_pct'::text, 'tarjeta'::text]) THEN t.monto_operacion
                ELSE - t.monto_operacion
            END
            WHEN 'comision'::text THEN - t.comision
            ELSE - t.impuesto
        END::numeric(20,2) AS monto,
    t.fecha,
    l.orden::smallint AS line_no,
    'legacy'::text AS posting_key,
    NULL::uuid AS reversal_of_entry_id,
    t.subcuenta_id AS subaccount_id,
    s.cbu AS cvu_propio,
        CASE
            WHEN l.concepto = 'principal'::text THEN t.cvu
            ELSE NULL::text
        END AS cvu,
    c.correo AS email,
    c.nombre,
        CASE l.concepto
            WHEN 'principal'::text THEN t.destinatario_nombre
            WHEN 'comision'::text THEN c.nombre
            ELSE NULL::text
        END AS nombre_destino,
        CASE l.concepto
            WHEN 'principal'::text THEN t.destinatario_cuit
            WHEN 'comision'::text THEN c.cuit
            ELSE NULL::text
        END AS cuit,
    t.estado_id,
    em.codigo AS estado_codigo,
    em.nombre AS estado_nombre,
    t.comercio_id,
    t.ledger_status,
    t.currency_code::text AS moneda,
    public._categoria_movimiento(t.tipo, l.concepto, 'legacy', t.currency_code::text) AS categoria
   FROM public.transactions t
     CROSS JOIN LATERAL ( VALUES ('principal'::text,1), ('comision'::text,2), ('impuesto'::text,3)) l(concepto, orden)
     LEFT JOIN public.subaccounts s ON s.id = t.subcuenta_id
     LEFT JOIN public.clientes c ON c.id = t.cliente_id
     LEFT JOIN public.estados_movimiento em ON em.id = t.estado_id
  WHERE t.ledger_status = 'legacy'::text AND (l.concepto = 'principal'::text OR l.concepto = 'comision'::text AND t.comision > 0::numeric OR l.concepto = 'impuesto'::text AND t.impuesto > 0::numeric)
UNION ALL
 -- Pendiente: lo apartado (disponible → retenido) de una operación en curso, en negativo.
 SELECT e.id AS line_id,
    t.id AS transaction_id,
    t.id_txn,
    t.legajo,
    t.tipo AS tipo_operacion,
    'pendiente'::text AS tipo_linea,
    e.concepto,
    (- e.amount)::numeric(20,2) AS monto,
    e.posted_at AS fecha,
    e.line_no,
    e.posting_key,
    NULL::uuid AS reversal_of_entry_id,
    a.subaccount_id,
    s.cbu AS cvu_propio,
    t.cvu,
    c.correo AS email,
    c.nombre,
    t.destinatario_nombre AS nombre_destino,
    t.destinatario_cuit AS cuit,
    t.estado_id,
    em.codigo AS estado_codigo,
    em.nombre AS estado_nombre,
    t.comercio_id,
    t.ledger_status,
    e.currency_code::text AS moneda,
    public._categoria_movimiento(t.tipo, 'principal', 'reserva', e.currency_code::text) AS categoria
   FROM public.ledger_entries e
     JOIN public.ledger_accounts a ON a.id = e.account_id AND a.subaccount_id IS NOT NULL
     JOIN public.subaccounts s ON s.id = a.subaccount_id
     JOIN public.transactions t ON t.id = e.transaction_id
     LEFT JOIN public.clientes c ON c.id = t.cliente_id
     LEFT JOIN public.estados_movimiento em ON em.id = t.estado_id
  WHERE t.ledger_status = 'reserved'::text
    AND e.concepto = 'reserva'::text AND e.posting_key = 'reserva'::text
    AND e.entry_type = 'credit'::text AND a.balance_bucket = 'retenido'::text;

-- Índices para las sumas por cliente y fecha.
create index if not exists pagos_cliente_fecha_idx
  on public.pagos (cliente_legajo, coalesce(pagado_at, created_at));
create index if not exists lotes_cliente_idx on public.lotes (cliente_legajo, created_at desc);
create index if not exists idx_ledger_entries_transaction on public.ledger_entries (transaction_id);

-- ---------------------------------------------------------------------------------------------
-- portal_resumen_periodo: Inicio, Mi cuenta, gráfico diario y exportación del Inicio.
-- ---------------------------------------------------------------------------------------------
create or replace function public.portal_resumen_periodo(p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
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
           public._categoria_movimiento(t.tipo, e.concepto, e.posting_key, e.currency_code::text) categoria,
           coalesce(t.fecha, t.created_at) fecha,
           sum(case when e.entry_type = 'credit' then e.amount else -e.amount end) neto
      from public.ledger_entries e
      join public.ledger_accounts a on a.id = e.account_id
      join subs on subs.id = a.subaccount_id
      join public.transactions t on t.id = e.transaction_id
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
$$;

-- ---------------------------------------------------------------------------------------------
-- portal_totales_historial: las tarjetas del historial sobre TODO lo filtrado (no la página).
-- Mismos filtros que la tabla. Lo rechazado y lo pendiente no entran en ingresos ni egresos.
-- ---------------------------------------------------------------------------------------------
create or replace function public.portal_totales_historial(
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_tipos text[] default null,
  p_tipo_linea text default null,
  p_subaccount_id uuid default null,
  p_clabe text default null,
  p_rfc text default null,
  p_txid text default null,
  p_titular text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_legajo text := public.current_cliente_legajo();
  r jsonb;
begin
  if v_legajo is null then
    raise exception 'Cliente no encontrado' using errcode = '42501';
  end if;
  with l as (
    select v.transaction_id, v.monto, v.moneda, v.tipo_linea, v.estado_codigo
      from public.v_transaction_lines v
     where v.legajo = v_legajo
       and (p_desde is null or v.fecha >= p_desde)
       and (p_hasta is null or v.fecha <= p_hasta)
       and (p_tipos is null or v.tipo_operacion = any (p_tipos))
       and (p_tipo_linea is null or v.tipo_linea = p_tipo_linea)
       and (p_subaccount_id is null or v.subaccount_id = p_subaccount_id)
       and (coalesce(btrim(p_clabe), '') = ''
            or v.cvu ilike '%' || btrim(p_clabe) || '%' or v.cvu_propio ilike '%' || btrim(p_clabe) || '%')
       and (coalesce(btrim(p_txid), '') = '' or v.id_txn ilike '%' || btrim(p_txid) || '%')
       and (coalesce(btrim(p_titular), '') = '' or v.nombre_destino ilike '%' || btrim(p_titular) || '%')
       and (coalesce(p_rfc, '') = ''
            or v.cuit ilike '%' || regexp_replace(p_rfc, '[\s-]', '', 'g') || '%')
  ),
  efectivas as (
    select * from l
     where tipo_linea <> 'pendiente' and coalesce(estado_codigo, '') <> 'RECHAZADO'
  )
  select jsonb_build_object(
    'lineas', (select count(*) from l),
    'monedas', coalesce((
      select jsonb_object_agg(moneda, jsonb_build_object(
        'ingresos', ingresos, 'egresos', egresos, 'neto', ingresos - egresos,
        'lineas_ingreso', li, 'lineas_egreso', le))
        from (select moneda,
                     coalesce(sum(monto) filter (where monto > 0), 0) ingresos,
                     coalesce(-sum(monto) filter (where monto < 0), 0) egresos,
                     count(*) filter (where monto > 0) li,
                     count(*) filter (where monto < 0) le
                from efectivas group by moneda) x), '{}'::jsonb),
    'tx_pendientes', (select count(distinct transaction_id) from l
                       where tipo_linea = 'pendiente'
                          or estado_codigo in ('PENDIENTE', 'EN_PROGRESO', 'CREADO', 'ABIERTO')),
    'tx_rechazadas', (select count(distinct transaction_id) from l where estado_codigo = 'RECHAZADO')
  ) into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- portal_resumen_links: cobros con tarjeta de los links de pago (tabla `pagos`), por entorno y
-- moneda, y lo cobrado por cada link. Antes la pantalla leía `transactions` tipo 'tarjeta', que
-- los cobros con Ecart Pay no usan, y siempre daba 0.
-- ---------------------------------------------------------------------------------------------
create or replace function public.portal_resumen_links(p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_legajo text := public.current_cliente_legajo();
  r jsonb;
begin
  if v_legajo is null then
    raise exception 'Cliente no encontrado' using errcode = '42501';
  end if;
  with p as (
    select x.entorno, x.moneda, x.link_id, x.monto, coalesce(x.monto_reembolsado, 0) reembolsado,
           case
             when x.estado = 'pagado' then 'aprobado'
             when x.estado in ('reembolsado', 'parcialmente_reembolsado') then 'reembolsado'
             when x.estado in ('creado', 'pendiente') then 'pendiente'
             else 'rechazado'
           end cat
      from public.pagos x
     where x.cliente_legajo = v_legajo and x.link_id is not null
       and coalesce(x.pagado_at, x.created_at) between p_desde and p_hasta
  )
  select jsonb_build_object(
    'grupos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entorno', entorno, 'moneda', moneda,
        'operaciones', count_all,
        'aprobados', aprobados, 'monto_aprobado', monto_aprobado,
        'pendientes', pendientes, 'rechazados', rechazados, 'reembolsados', reembolsados))
        from (select entorno, moneda, count(*) count_all,
                     count(*) filter (where cat = 'aprobado') aprobados,
                     coalesce(sum(monto - reembolsado) filter (where cat in ('aprobado', 'reembolsado')), 0) monto_aprobado,
                     count(*) filter (where cat = 'pendiente') pendientes,
                     count(*) filter (where cat = 'rechazado') rechazados,
                     count(*) filter (where cat = 'reembolsado') reembolsados
                from p group by 1, 2) g), '[]'::jsonb),
    'por_link', coalesce((
      select jsonb_agg(jsonb_build_object('link_id', link_id, 'entorno', entorno, 'moneda', moneda,
                                          'cobrado', cobrado, 'pagos', n))
        from (select link_id, entorno, moneda,
                     sum(monto - reembolsado) filter (where cat in ('aprobado', 'reembolsado')) cobrado,
                     count(*) filter (where cat in ('aprobado', 'reembolsado')) n
                from p group by 1, 2, 3) k where n > 0), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Cobros masivos: resumen del período y gestión de lotes sin el tope de 1000 filas.
-- ---------------------------------------------------------------------------------------------
create or replace function public.portal_lotes_gestion()
returns table (
  id text, nombre text, periodo text, created_at timestamptz, fecha_finalizacion timestamptz,
  estado text, monto_total numeric, monto_cobrado numeric,
  pagados bigint, parciales bigint, pendientes bigint, registros bigint
)
language plpgsql
stable
security definer
set search_path to ''
as $$
#variable_conflict use_column
declare
  v_legajo text := public.current_cliente_legajo();
begin
  if v_legajo is null then
    raise exception 'Cliente no encontrado' using errcode = '42501';
  end if;
  return query
  select l.id, l.nombre, l.periodo, l.created_at, l.fecha_finalizacion, l.estado,
         coalesce(sum(r.monto), 0), coalesce(sum(r.monto_pagado), 0),
         count(r.id) filter (where r.estado = 'pagado_total'),
         count(r.id) filter (where r.estado = 'pagado_parcial'),
         count(r.id) filter (where r.estado in ('pendiente', 'vencido')),
         count(r.id)
    from public.lotes l
    left join public.lote_registros r on r.lote_id = l.id
   where l.cliente_legajo = v_legajo and l.estado <> 'eliminado'
   group by l.id
   order by l.created_at desc;
end;
$$;

create or replace function public.portal_resumen_cobros_masivos(p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_legajo text := public.current_cliente_legajo();
  r jsonb;
begin
  if v_legajo is null then
    raise exception 'Cliente no encontrado' using errcode = '42501';
  end if;
  with lotes as (
    select l.id, l.nombre, l.estado, l.created_at
      from public.lotes l
     where l.cliente_legajo = v_legajo and l.estado <> 'eliminado'
       and l.created_at between p_desde and p_hasta
  ),
  regs as (
    select r.lote_id, r.estado, r.monto, r.monto_pagado
      from public.lote_registros r join lotes on lotes.id = r.lote_id
  ),
  por_lote as (
    select l.id, l.nombre, l.estado, l.created_at,
           coalesce(sum(r.monto), 0) monto_total, coalesce(sum(r.monto_pagado), 0) monto_cobrado,
           count(r.lote_id) filter (where r.estado = 'pagado_total') pagados,
           count(r.lote_id) filter (where r.estado = 'pagado_parcial') parciales,
           count(r.lote_id) filter (where r.estado in ('pendiente', 'vencido')) pendientes
      from lotes l left join regs r on r.lote_id = l.id
     group by l.id, l.nombre, l.estado, l.created_at
  )
  select jsonb_build_object(
    'kpi', jsonb_build_object(
      'totalLotes', (select count(*) from lotes),
      'enProceso', (select count(*) from lotes where estado = 'en_proceso'),
      'finalizados', (select count(*) from lotes where estado = 'finalizado'),
      'conError', (select count(*) from lotes where estado = 'error'),
      'montoTotal', (select coalesce(sum(monto), 0) from regs),
      'montoCobrado', (select coalesce(sum(monto_pagado), 0) from regs),
      'montoPendiente', (select coalesce(sum(monto) - sum(monto_pagado), 0) from regs)),
    'noCobradas', (
      select jsonb_build_object(
        'totalOperaciones', count(*),
        'vencidas', count(*) filter (where estado = 'vencido'),
        'vigentes', count(*) filter (where estado not in ('vencido', 'pagado_total')),
        'montoNoCobrado', coalesce(sum(monto - monto_pagado) filter (where estado <> 'pagado_total'), 0),
        'porcentajeNoCobrado', case when coalesce(sum(monto), 0) > 0
          then round(coalesce(sum(monto - monto_pagado) filter (where estado <> 'pagado_total'), 0) / sum(monto) * 100)
          else 0 end)
        from regs),
    'lotesRecientes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'nombre', nombre, 'estado', estado, 'createdAt', created_at,
        'montoTotal', monto_total, 'montoCobrado', monto_cobrado,
        'progreso', case when monto_total > 0 then round(monto_cobrado / monto_total * 100) else 0 end,
        'cantidadPagos', pagados, 'cantidadParciales', parciales, 'cantidadPendientes', pendientes)
        order by created_at desc)
        from (select * from por_lote order by created_at desc limit 10) x), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;

-- Permisos: solo usuarios con sesión (cada función filtra por el cliente de la sesión).
revoke all on function public.portal_resumen_periodo(timestamptz, timestamptz) from public, anon;
revoke all on function public.portal_totales_historial(timestamptz, timestamptz, text[], text, uuid, text, text, text, text) from public, anon;
revoke all on function public.portal_resumen_links(timestamptz, timestamptz) from public, anon;
revoke all on function public.portal_lotes_gestion() from public, anon;
revoke all on function public.portal_resumen_cobros_masivos(timestamptz, timestamptz) from public, anon;
grant execute on function public.portal_resumen_periodo(timestamptz, timestamptz) to authenticated;
grant execute on function public.portal_totales_historial(timestamptz, timestamptz, text[], text, uuid, text, text, text, text) to authenticated;
grant execute on function public.portal_resumen_links(timestamptz, timestamptz) to authenticated;
grant execute on function public.portal_lotes_gestion() to authenticated;
grant execute on function public.portal_resumen_cobros_masivos(timestamptz, timestamptz) to authenticated;
