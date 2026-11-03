-- Comisiones de JPay ("calculadora"), reunión con JPay del 3/11/2026: JPay no toca dinero.
--
-- - Ecart Pay le liquida directo a cada comercio y le paga a JPay la suma de sus comisiones, por
--   fuera de la plataforma. Acá se calcula cuánto le corresponde a JPay por comercio, producto y
--   período, y se registran los pagos recibidos para conciliarlos.
-- - Cobre: dos modos (cobre_configuracion.modo_comision):
--     'descontar' (el de siempre): la comisión se descuenta del saldo del comercio en cada
--       operación;
--     'calcular': no se descuenta nada; la comisión se calcula y se le pide el pago a la empresa.
--   `calcular_comision` devuelve 0 para las operaciones de Cobre en modo 'calcular' y
--   `comision_teorica` sigue dando el valor (para la calculadora).
-- - Porcentajes configurables por país (configuracion_pagos): enlaces de pago y POS usan
--   comision_pct / comision_fija; suscripciones y domiciliación tienen el suyo (pregunta P4).
--   Un comercio puede tener su propia comisión (comercio_proveedores.comision_pct / _fija).
-- Aditiva.

alter table public.cobre_configuracion
  add column if not exists modo_comision text not null default 'descontar'
    check (modo_comision in ('descontar', 'calcular'));

alter table public.configuracion_pagos
  add column if not exists comision_suscripcion_pct numeric(7, 4) not null default 0
    check (comision_suscripcion_pct >= 0 and comision_suscripcion_pct < 100),
  add column if not exists comision_domiciliacion_pct numeric(7, 4) not null default 0
    check (comision_domiciliacion_pct >= 0 and comision_domiciliacion_pct < 100);

-- Comisión según las reglas del cliente, sin mirar el modo de Cobre (la usa la calculadora).
create or replace function public.comision_teorica(
  p_cliente_id uuid,
  p_monto numeric,
  p_subcuenta_id uuid,
  p_tipo text
)
returns table(comision numeric, impuesto numeric)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  k record;
  v_com numeric := 0;
begin
  select * into k from public._comision_aplicable(p_cliente_id, p_subcuenta_id, p_tipo);
  if found then
    if k.modalidad = 'Fijo' then
      v_com := coalesce(k.monto_fijo, 0);
    elsif coalesce(k.porcentaje, 0) > 0 then
      v_com := round(p_monto * k.porcentaje / 100, 2);
    end if;
  end if;
  v_com := greatest(coalesce(v_com, 0), 0);
  return query select v_com, round(v_com * coalesce(k.porcentaje_impuesto, 16) / 100, 2);
end;
$$;

-- Igual que antes, salvo Cobre en modo 'calcular': no se descuenta comisión del saldo.
create or replace function public.calcular_comision(
  p_cliente_id uuid,
  p_monto numeric,
  p_subcuenta_id uuid default null,
  p_tipo text default 'Retiro',
  p_destino text default null
)
returns table(comision numeric, impuesto numeric)
language plpgsql
stable
security definer
set search_path to ''
as $$
DECLARE
    k        record;
    v_com    numeric := 0;
BEGIN
    IF p_tipo NOT IN ('Retiro', 'Depósito', 'Conversión') THEN
        RAISE EXCEPTION 'Tipo de comision no soportado: %', p_tipo;
    END IF;
    IF p_tipo = 'Retiro' AND public._es_transferencia_interna(p_cliente_id, p_destino) THEN
        RETURN QUERY SELECT 0::numeric, 0::numeric;
        RETURN;
    END IF;
    -- Cobre (México) en modo "calcular": JPay no toca el saldo; la comisión se pide aparte.
    IF EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = p_cliente_id AND c.pais = 'MX')
       AND coalesce((SELECT modo_comision FROM public.cobre_configuracion WHERE id = 1), 'descontar') = 'calcular' THEN
        RETURN QUERY SELECT 0::numeric, 0::numeric;
        RETURN;
    END IF;

    SELECT * INTO k FROM public._comision_aplicable(p_cliente_id, p_subcuenta_id, p_tipo);
    IF FOUND THEN
        IF k.modalidad = 'Fijo' THEN
            v_com := coalesce(k.monto_fijo, 0);
        ELSIF coalesce(k.porcentaje, 0) > 0 THEN
            v_com := round(p_monto * k.porcentaje / 100, 2);
        END IF;
    END IF;
    v_com := greatest(coalesce(v_com, 0), 0);

    RETURN QUERY SELECT v_com, round(v_com * coalesce(k.porcentaje_impuesto, 21) / 100, 2);
END;
$$;

-- La conversión a dólares calcula su comisión con `cobre_comision_cruce` (1041), que llama a
-- calcular_comision: en modo 'calcular' queda en 0 y la calculadora la toma de comision_teorica.

-- Pagos de comisiones que recibe JPay (de Ecart Pay o de cada empresa en Cobre).
create table if not exists public.pagos_comisiones_jpay (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null check (proveedor in ('ecartpay', 'cobre')),
  cliente_legajo text references public.clientes (legajo) on delete restrict,
  periodo_desde date not null,
  periodo_hasta date not null check (periodo_hasta >= periodo_desde),
  monto numeric(14, 2) not null check (monto > 0),
  moneda text not null default 'MXN',
  fecha_pago date not null,
  referencia text,
  nota text,
  registrado_por uuid,
  created_at timestamptz not null default now()
);
alter table public.pagos_comisiones_jpay enable row level security;
revoke all on public.pagos_comisiones_jpay from anon;
revoke insert, update, delete on public.pagos_comisiones_jpay from authenticated;
grant select on public.pagos_comisiones_jpay to authenticated;
drop policy if exists pagos_comisiones_jpay_select on public.pagos_comisiones_jpay;
create policy pagos_comisiones_jpay_select on public.pagos_comisiones_jpay for select to authenticated
  using (public.es_backoffice());

/**
 * Calculadora: comisiones de JPay por comercio y producto en el período [p_desde, p_hasta]
 * (fechas en la zona del país de la instalación).
 *   Ecart Pay: enlaces de pago y POS (pagos cobrados, neto de reembolsos), suscripciones y
 *     domiciliaciones (cobros confirmados). Siempre "por cobrar": Ecart Pay se la paga a JPay.
 *   Cobre: depósitos, transferencias y conversiones contabilizadas. Si la operación ya tiene
 *     comisión, está "descontada" (modo descontar); si no y el modo es 'calcular', se calcula y
 *     queda "por cobrar".
 */
create or replace function public.comisiones_jpay(p_desde date, p_hasta date)
returns table (
  proveedor text,
  producto text,
  cliente_legajo text,
  cliente_nombre text,
  operaciones bigint,
  base numeric,
  comision numeric,
  iva numeric,
  forma text
)
language plpgsql
stable
security definer
set search_path to ''
as $$
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
  -- Comisión del comercio si tiene una propia; si no, la general del país.
  pagos_ecart as (
    select p.cliente_legajo, case when p.caja_id is null then 'Enlaces de pago' else 'POS' end producto,
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
           r.monto base,
           case r.tipo when 'suscripcion' then (select pct_sus from cfg) else (select pct_dom from cfg) end pct
      from public.cobros_recurrentes r
     where r.estado = 'pagado' and r.cobrado_at >= v_ini and r.cobrado_at < v_fin
  ),
  ecart as (
    select 'ecartpay'::text proveedor, x.producto, x.cliente_legajo, count(*) ops, sum(x.base) base,
           round(sum(x.base * x.pct / 100 + x.fija), 2) comision
      from pagos_ecart x group by 2, 3
    union all
    select 'ecartpay', y.producto, y.cliente_legajo, count(*), sum(y.base), round(sum(y.base * y.pct / 100), 2)
      from recurrentes y group by 2, 3
  ),
  cobre_tx as (
    select t.legajo, t.cliente_id, t.subcuenta_id, t.monto_operacion, t.comision, t.impuesto,
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
    select z.legajo, z.producto, z.monto_operacion,
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
         e.ops, e.base, e.comision, round(e.comision * (select iva from cfg) / 100, 2), 'por_cobrar'::text
    from ecart e left join public.clientes cl on cl.legajo = e.cliente_legajo
  union all
  select 'cobre', c.producto, c.legajo, coalesce(nullif(cl.nombre_legal, ''), cl.nombre),
         count(*), sum(c.monto_operacion), sum(c.comision), sum(c.iva), c.forma
    from cobre c left join public.clientes cl on cl.legajo = c.legajo
   where c.comision > 0
   group by c.producto, c.legajo, cl.nombre_legal, cl.nombre, c.forma
   order by 1, 3, 2;
end;
$$;

create or replace function public.registrar_pago_comisiones(
  p_proveedor text,
  p_cliente_legajo text,
  p_desde date,
  p_hasta date,
  p_monto numeric,
  p_fecha_pago date,
  p_referencia text,
  p_nota text
)
returns public.pagos_comisiones_jpay
language plpgsql
security definer
set search_path to ''
as $$
declare
  r public.pagos_comisiones_jpay;
begin
  perform public.exigir_backoffice();
  insert into public.pagos_comisiones_jpay (proveedor, cliente_legajo, periodo_desde, periodo_hasta,
    monto, fecha_pago, referencia, nota, registrado_por)
  values (p_proveedor, nullif(trim(coalesce(p_cliente_legajo, '')), ''), p_desde, p_hasta, p_monto,
    p_fecha_pago, nullif(trim(coalesce(p_referencia, '')), ''), nullif(trim(coalesce(p_nota, '')), ''), auth.uid())
  returning * into r;
  return r;
end;
$$;

revoke all on function public.comision_teorica(uuid, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.comision_teorica(uuid, numeric, uuid, text) to service_role;
revoke all on function public.comisiones_jpay(date, date) from public, anon;
grant execute on function public.comisiones_jpay(date, date) to authenticated;
revoke all on function public.registrar_pago_comisiones(text, text, date, date, numeric, date, text, text) from public, anon;
grant execute on function public.registrar_pago_comisiones(text, text, date, date, numeric, date, text, text) to authenticated;
