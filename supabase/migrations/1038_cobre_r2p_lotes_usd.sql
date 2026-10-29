-- Cobre según el Solution Design de JPAY (2026-10-26), fases D2 a D5.
--
-- D2 · Envíos SPEI
-- - La aprobación de admin sobre un monto pasa a ser de JPay (el documento deja apagado el
--   `checker_approval` de Cobre): la transferencia queda `pendiente_aprobacion` con la reserva
--   hecha y recién se manda a Cobre al aprobarse.
-- - Rebote posterior a `completed` (crédito `spei_rejected` o money movement `spei_return`):
--   estado `devuelta` y `cobre_reintegrar_transferencia` revierte el envío y la reserva (vuelven
--   monto, comisión e IVA al disponible), una sola vez.
-- - Lotes (`/bulk_money_movements`): `cobre_lotes`; cada ítem es una `cobre_transferencias` con
--   `lote_id` y se cierra por su propio estado.
-- D3 · Cobros Direct Link R2P SPEI: `cobre_cobros_r2p` (CLABE dinámica, vencimiento, estado).
-- D4 · USD: el ledger admite USD. Subcuenta en dólares por comercio (`subaccounts.moneda`).
--   Los Balances Global y USA de la matriz se llevan juntos en `BANCO_COBRE_USD` (el traslado
--   Global→USA es interno de Cobre y no cambia lo que JPay debe a cada comercio).
--   Conversión: `cobre_cruces` + `cobre_reservar_cruce` / `cobre_confirmar_cruce` /
--   `cobre_liberar_cruce` (MXN retenido → BANCO_COBRE; USD BANCO_COBRE_USD → subcuenta USD).
-- D5 · Envíos USD (Fedwire / SWIFT): contrapartes `business`; la transferencia en USD pasa por
--   `trasladando` (global_pay_to_usa) antes del pago. `cobre_confirmar_transferencia` contabiliza
--   contra el banco y las cuentas de comisión de la moneda de la transacción.
-- Aditiva.

-- ── Moneda USD ──────────────────────────────────────────────────────────────
alter table public.ledger_accounts drop constraint if exists ledger_accounts_currency_code_check;
alter table public.ledger_accounts add constraint ledger_accounts_currency_code_check
  check (currency_code in ('ARS', 'MXN', 'USD'));
alter table public.ledger_entries drop constraint if exists ledger_entries_currency_code_check;
alter table public.ledger_entries add constraint ledger_entries_currency_code_check
  check (currency_code in ('ARS', 'MXN', 'USD'));
alter table public.transactions drop constraint if exists transactions_currency_code_check;
alter table public.transactions add constraint transactions_currency_code_check
  check (currency_code in ('ARS', 'MXN', 'USD'));

insert into public.ledger_accounts (account_code, name, account_type, currency_code) values
  ('BANCO_COBRE_USD', 'Cobre Balances Global y USA (dólares)', 'asset', 'USD'),
  ('INGRESOS_COMISIONES_USD', 'Ingresos por comisiones (USD)', 'revenue', 'USD'),
  ('IVA_DEBITO_FISCAL_USD', 'IVA trasladado a pagar (USD)', 'liability', 'USD')
on conflict (account_code) do nothing;

-- Subcuenta con moneda explícita (la de dólares del comercio); sin dato, la del país.
alter table public.subaccounts
  add column if not exists moneda char(3) check (moneda is null or moneda in ('ARS', 'MXN', 'USD'));

create or replace function public.tg_subaccounts_init_balance()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_moneda char(3) := NEW.moneda;
begin
  if v_moneda is null then
    select p.moneda into v_moneda
      from public.clientes c join public.paises p on p.codigo = c.pais
     where c.legajo = NEW.cliente_legajo;
  end if;
  insert into public.subaccount_balances (subaccount_id) values (NEW.id);
  insert into public.ledger_accounts (account_code, name, account_type, subaccount_id, balance_bucket, currency_code)
  select 'SUB-' || NEW.id || '-' || upper(b.bucket),
         'Fondos ' || b.bucket || ' · ' || NEW.cliente_legajo || ' · ' || coalesce(nullif(NEW.nombre, ''), NEW.tipo),
         'liability', NEW.id, b.bucket, coalesce(v_moneda, 'ARS')
    from (values ('disponible'), ('retenido')) b(bucket);
  return null;
end;
$$;

-- Cuentas de banco y comisiones de Cobre según la moneda.
create or replace function public._cobre_cuenta(p_tipo text, p_moneda text)
returns uuid
language sql
stable
set search_path to ''
as $$
  select public._ledger_account_id(case
    when p_tipo = 'banco' then case p_moneda when 'USD' then 'BANCO_COBRE_USD' else 'BANCO_COBRE' end
    when p_tipo = 'comision' then case p_moneda when 'USD' then 'INGRESOS_COMISIONES_USD' else 'INGRESOS_COMISIONES_MXN' end
    else case p_moneda when 'USD' then 'IVA_DEBITO_FISCAL_USD' else 'IVA_DEBITO_FISCAL_MXN' end
  end);
$$;

create or replace function public.cobre_confirmar_transferencia(p_id_txn text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tx record;
begin
  select id, id_txn, subcuenta_id, ledger_status, monto_operacion, comision, impuesto, currency_code
    into v_tx
    from public.transactions where id_txn = trim(p_id_txn) for update;
  if not found then
    raise exception 'Transferencia % no encontrada', p_id_txn;
  end if;
  if v_tx.ledger_status = 'posted' then
    return jsonb_build_object('ok', true, 'ya_registrada', true, 'id_txn', v_tx.id_txn);
  end if;
  if v_tx.ledger_status <> 'reserved' then
    raise exception 'La transferencia % no tiene fondos reservados (estado contable %)',
      v_tx.id_txn, v_tx.ledger_status;
  end if;

  perform public.ledger_post(v_tx.id, 'envio', public._ledger_lines(
    public._ledger_line(public._ledger_sub_account_id(v_tx.subcuenta_id, 'retenido'), 'debit', v_tx.monto_operacion),
    public._ledger_line(public._ledger_sub_account_id(v_tx.subcuenta_id, 'retenido'), 'debit', v_tx.comision, 'comision'),
    public._ledger_line(public._ledger_sub_account_id(v_tx.subcuenta_id, 'retenido'), 'debit', v_tx.impuesto, 'impuesto'),
    public._ledger_line(public._cobre_cuenta('banco', v_tx.currency_code), 'credit', v_tx.monto_operacion),
    public._ledger_line(public._cobre_cuenta('comision', v_tx.currency_code), 'credit', v_tx.comision, 'comision'),
    public._ledger_line(public._cobre_cuenta('iva', v_tx.currency_code), 'credit', v_tx.impuesto, 'impuesto')
  ), 'posted');

  update public.transactions set estado_id = public._estado_movimiento_id('APROBADO') where id = v_tx.id;
  return jsonb_build_object('ok', true, 'ya_registrada', false, 'id_txn', v_tx.id_txn,
    'total_debitado', v_tx.monto_operacion + v_tx.comision + v_tx.impuesto);
end;
$$;

-- Rebote de un envío ya contabilizado: revierte envío y reserva (vuelve todo al disponible).
create or replace function public.cobre_reintegrar_transferencia(p_id_txn text, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tx record;
  v_lineas int;
begin
  select id, id_txn, ledger_status into v_tx
    from public.transactions where id_txn = trim(p_id_txn) for update;
  if not found then
    raise exception 'Transferencia % no encontrada', p_id_txn;
  end if;
  if v_tx.ledger_status = 'reversed' then
    return jsonb_build_object('ok', true, 'ya_reintegrada', true, 'id_txn', v_tx.id_txn);
  end if;
  if v_tx.ledger_status <> 'posted' then
    raise exception 'La transferencia % no está contabilizada (estado contable %)', v_tx.id_txn, v_tx.ledger_status;
  end if;
  v_lineas := public._ledger_reverse(v_tx.id, 'rebote', 'reversed');
  update public.transactions set estado_id = public._estado_movimiento_id('RECHAZADO') where id = v_tx.id;
  return jsonb_build_object('ok', true, 'ya_reintegrada', false, 'id_txn', v_tx.id_txn,
    'lineas', v_lineas, 'motivo', p_motivo);
end;
$$;

-- ── Contrapartes y transferencias ───────────────────────────────────────────
alter table public.cobre_contrapartes drop constraint if exists cobre_contrapartes_tipo_check;
alter table public.cobre_contrapartes add constraint cobre_contrapartes_tipo_check
  check (tipo in ('clabe', 'spei_card', 'business'));
alter table public.cobre_contrapartes drop constraint if exists cobre_contrapartes_numero_check;
alter table public.cobre_contrapartes add constraint cobre_contrapartes_numero_check
  check ((tipo <> 'business' and numero ~ '^[0-9]{15,18}$') or (tipo = 'business' and numero ~ '^[A-Z0-9]{4,34}$'));
alter table public.cobre_contrapartes drop constraint if exists cobre_contrapartes_id_tipo_check;
alter table public.cobre_contrapartes add constraint cobre_contrapartes_id_tipo_check
  check (id_tipo in ('rfc', 'curp', 'nit', 'ein', 'tax_id', 'otro'));
alter table public.cobre_contrapartes drop constraint if exists cobre_contrapartes_verificacion_check;
alter table public.cobre_contrapartes add constraint cobre_contrapartes_verificacion_check
  check (verificacion in ('sin_verificar', 'procesando', 'matched', 'unmatched', 'unresolved',
                          'verified', 'rejected', 'failed'));
alter table public.cobre_contrapartes
  add column if not exists rail text check (rail is null or rail in ('fedwire', 'swift')),
  add column if not exists geo text,
  add column if not exists datos jsonb not null default '{}'::jsonb,
  add column if not exists verificacion_motivo text;

alter table public.cobre_transferencias drop constraint if exists cobre_transferencias_estado_check;
alter table public.cobre_transferencias add constraint cobre_transferencias_estado_check
  check (estado in ('enviando', 'pendiente', 'pendiente_aprobacion', 'trasladando', 'completada',
                    'rechazada', 'fallida', 'cancelada', 'error_envio', 'devuelta'));
alter table public.cobre_transferencias
  add column if not exists tipo text not null default 'spei' check (tipo in ('spei', 'fedwire', 'swift')),
  add column if not exists moneda text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  add column if not exists lote_id uuid,
  add column if not exists traslado_mm_id text,
  add column if not exists traslado_estado text,
  add column if not exists swift_uetr text,
  add column if not exists devuelta_at timestamptz,
  add column if not exists instancia_id uuid references public.cobre_instancias (id) on delete restrict;
alter table public.cobre_transferencias alter column cuenta_origen_externa_id drop not null;

-- ── Lotes ───────────────────────────────────────────────────────────────────
create table if not exists public.cobre_lotes (
  id uuid primary key default gen_random_uuid(),
  modo text not null check (modo in ('simulado', 'prueba', 'produccion')),
  cliente_legajo text not null references public.clientes (legajo) on delete restrict,
  subcuenta_id uuid not null references public.subaccounts (id) on delete restrict,
  lote_externo_id text unique,
  archivo text not null,
  estado text not null default 'preparando'
    check (estado in ('preparando', 'enviando', 'validating', 'processing', 'pending_approval',
                      'completed', 'canceled', 'failed', 'error_envio')),
  cantidad int not null check (cantidad > 0),
  total numeric(14, 2) not null check (total > 0),
  motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cobre_lotes_cliente_idx on public.cobre_lotes (cliente_legajo, created_at desc);
do $$ begin
  alter table public.cobre_transferencias
    add constraint cobre_transferencias_lote_fk foreign key (lote_id) references public.cobre_lotes (id) on delete restrict;
exception when duplicate_object then null; end $$;

-- ── Cobros R2P ──────────────────────────────────────────────────────────────
create table if not exists public.cobre_cobros_r2p (
  id uuid primary key default gen_random_uuid(),
  modo text not null check (modo in ('simulado', 'prueba', 'produccion')),
  cliente_legajo text not null references public.clientes (legajo) on delete restrict,
  subcuenta_id uuid not null references public.subaccounts (id) on delete restrict,
  link_id uuid,
  pago_id uuid,
  external_id text not null unique,
  mm_id text unique,
  contraparte_externa_id text,
  cuenta_destino_externa_id text not null,
  monto numeric(14, 2) not null check (monto > 0),
  concepto text,
  pagador_nombre text not null,
  pagador_id_tipo text not null check (pagador_id_tipo in ('rfc', 'curp')),
  pagador_id_numero text not null,
  pagador_correo text,
  clabe_dinamica text,
  valido_hasta timestamptz not null,
  estado text not null default 'creando'
    check (estado in ('creando', 'pendiente', 'pagado', 'vencido', 'rechazado', 'fallido', 'error_envio')),
  codigo text,
  motivo text,
  transaccion_externa_id text,
  transaction_id uuid references public.transactions (id) on delete set null,
  pagado_at timestamptz,
  instancia_id uuid references public.cobre_instancias (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cobre_cobros_r2p_cliente_idx on public.cobre_cobros_r2p (cliente_legajo, created_at desc);
create index if not exists cobre_cobros_r2p_estado_idx on public.cobre_cobros_r2p (estado, valido_hasta);

-- ── Conversiones MXN → USD ──────────────────────────────────────────────────
create table if not exists public.cobre_cruces (
  id uuid primary key default gen_random_uuid(),
  modo text not null check (modo in ('simulado', 'prueba', 'produccion')),
  cliente_legajo text not null references public.clientes (legajo) on delete restrict,
  subcuenta_mxn_id uuid not null references public.subaccounts (id) on delete restrict,
  subcuenta_usd_id uuid not null references public.subaccounts (id) on delete restrict,
  cotizacion_id text not null,
  tasa numeric(18, 8) not null check (tasa > 0),
  monto_mxn numeric(14, 2) not null check (monto_mxn > 0),
  monto_usd numeric(14, 2) not null check (monto_usd > 0),
  comisiones jsonb not null default '{}'::jsonb,
  fuera_de_mercado boolean not null default false,
  cotizacion_vence_at timestamptz not null,
  external_id text not null unique,
  idempotency text not null unique,
  mm_id text unique,
  estado text not null default 'cotizado'
    check (estado in ('cotizado', 'pendiente_aprobacion', 'enviando', 'initiated', 'processing',
                      'completada', 'rechazada', 'fallida', 'vencida', 'error_envio')),
  codigo text,
  motivo text,
  transaction_mxn_id uuid references public.transactions (id) on delete set null,
  transaction_usd_id uuid references public.transactions (id) on delete set null,
  decidida_por text,
  decidida_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cobre_cruces_cliente_idx on public.cobre_cruces (cliente_legajo, created_at desc);

alter table public.cobre_configuracion
  add column if not exists monto_aprobacion_usd numeric(14, 2)
    check (monto_aprobacion_usd is null or monto_aprobacion_usd > 0);

-- RLS de las tablas nuevas.
alter table public.cobre_lotes enable row level security;
alter table public.cobre_cobros_r2p enable row level security;
alter table public.cobre_cruces enable row level security;
revoke all on public.cobre_lotes, public.cobre_cobros_r2p, public.cobre_cruces from anon;
revoke insert, update, delete on public.cobre_lotes, public.cobre_cobros_r2p, public.cobre_cruces from authenticated;
grant select on public.cobre_lotes, public.cobre_cobros_r2p, public.cobre_cruces to authenticated;
drop policy if exists cobre_lotes_select on public.cobre_lotes;
create policy cobre_lotes_select on public.cobre_lotes for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());
drop policy if exists cobre_cobros_r2p_select on public.cobre_cobros_r2p;
create policy cobre_cobros_r2p_select on public.cobre_cobros_r2p for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());
drop policy if exists cobre_cruces_select on public.cobre_cruces;
create policy cobre_cruces_select on public.cobre_cruces for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());

-- ── Asientos de la conversión ───────────────────────────────────────────────
-- Reserva: MXN disponible → retenido en la subcuenta de pesos (transacción `conversion`).
create or replace function public.cobre_reservar_cruce(p_cruce_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_c public.cobre_cruces;
  v_cliente_id uuid;
  v_tx_id uuid;
  v_disp numeric;
begin
  select * into v_c from public.cobre_cruces where id = p_cruce_id for update;
  if not found then
    raise exception 'Conversión % inexistente', p_cruce_id;
  end if;
  if v_c.transaction_mxn_id is not null then
    return jsonb_build_object('ok', true, 'ya_reservada', true, 'transaction_id', v_c.transaction_mxn_id);
  end if;
  select id into v_cliente_id from public.clientes where legajo = v_c.cliente_legajo;
  perform public._lock_cliente_reglas(v_cliente_id);
  if public._bloqueo_activo(v_cliente_id, v_c.subcuenta_mxn_id) is not null then
    return jsonb_build_object('ok', false, 'motivo', 'La cuenta tiene un bloqueo vigente');
  end if;
  select saldo_disponible into v_disp from public.subaccount_balances
   where subaccount_id = v_c.subcuenta_mxn_id for update;
  if coalesce(v_disp, 0) < v_c.monto_mxn then
    return jsonb_build_object('ok', false, 'motivo', 'Saldo insuficiente en pesos');
  end if;

  insert into public.transactions (
    cliente_id, legajo, id_txn, tipo, cvu, subcuenta_id, destinatario_nombre,
    monto_operacion, comision, impuesto, monto_cobrado, estado_id
  ) values (
    v_cliente_id, v_c.cliente_legajo, v_c.external_id, 'conversion', 'COBRE-FX', v_c.subcuenta_mxn_id,
    'Conversión a dólares', v_c.monto_mxn, 0, 0, 0, public._estado_movimiento_id('EN_PROGRESO')
  ) returning id into v_tx_id;

  perform public.ledger_post(v_tx_id, 'reserva', public._ledger_lines(
    public._ledger_line(public._ledger_sub_account_id(v_c.subcuenta_mxn_id, 'disponible'), 'debit', v_c.monto_mxn, 'reserva'),
    public._ledger_line(public._ledger_sub_account_id(v_c.subcuenta_mxn_id, 'retenido'), 'credit', v_c.monto_mxn, 'reserva')
  ), 'reserved');
  update public.cobre_cruces set transaction_mxn_id = v_tx_id, updated_at = now() where id = p_cruce_id;
  return jsonb_build_object('ok', true, 'ya_reservada', false, 'transaction_id', v_tx_id);
end;
$$;

-- Completada: salen los pesos del Balance del comercio y entran dólares a su subcuenta USD.
create or replace function public.cobre_confirmar_cruce(p_cruce_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_c public.cobre_cruces;
  v_cliente_id uuid;
  v_usd_id uuid;
  v_status text;
begin
  select * into v_c from public.cobre_cruces where id = p_cruce_id for update;
  if not found then
    raise exception 'Conversión % inexistente', p_cruce_id;
  end if;
  if v_c.transaction_usd_id is not null then
    return jsonb_build_object('ok', true, 'ya_registrada', true);
  end if;
  if v_c.transaction_mxn_id is null then
    raise exception 'La conversión % no tiene pesos reservados', p_cruce_id;
  end if;
  select ledger_status into v_status from public.transactions where id = v_c.transaction_mxn_id for update;
  if v_status <> 'reserved' then
    raise exception 'La conversión % no está reservada (estado contable %)', p_cruce_id, v_status;
  end if;
  select id into v_cliente_id from public.clientes where legajo = v_c.cliente_legajo;

  perform public.ledger_post(v_c.transaction_mxn_id, 'conversion', public._ledger_lines(
    public._ledger_line(public._ledger_sub_account_id(v_c.subcuenta_mxn_id, 'retenido'), 'debit', v_c.monto_mxn),
    public._ledger_line(public._ledger_account_id('BANCO_COBRE'), 'credit', v_c.monto_mxn)
  ), 'posted');
  update public.transactions set estado_id = public._estado_movimiento_id('APROBADO') where id = v_c.transaction_mxn_id;

  insert into public.transactions (
    cliente_id, legajo, id_txn, tipo, cvu, subcuenta_id, destinatario_nombre,
    monto_operacion, comision, impuesto, monto_cobrado, estado_id
  ) values (
    v_cliente_id, v_c.cliente_legajo, v_c.external_id || '-USD', 'conversion', 'COBRE-FX', v_c.subcuenta_usd_id,
    'Conversión desde pesos', v_c.monto_usd, 0, 0, 0, public._estado_movimiento_id('APROBADO')
  ) returning id into v_usd_id;
  perform public.ledger_post(v_usd_id, 'conversion', public._ledger_lines(
    public._ledger_line(public._ledger_account_id('BANCO_COBRE_USD'), 'debit', v_c.monto_usd),
    public._ledger_line(public._ledger_sub_account_id(v_c.subcuenta_usd_id, 'disponible'), 'credit', v_c.monto_usd)
  ), 'posted');

  update public.cobre_cruces set transaction_usd_id = v_usd_id, updated_at = now() where id = p_cruce_id;
  return jsonb_build_object('ok', true, 'ya_registrada', false, 'monto_usd', v_c.monto_usd);
end;
$$;

-- Rechazada, fallida o vencida: libera los pesos reservados.
create or replace function public.cobre_liberar_cruce(p_cruce_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_c public.cobre_cruces;
  v_status text;
begin
  select * into v_c from public.cobre_cruces where id = p_cruce_id for update;
  if not found then
    raise exception 'Conversión % inexistente', p_cruce_id;
  end if;
  if v_c.transaction_mxn_id is null then
    return jsonb_build_object('ok', true, 'sin_reserva', true);
  end if;
  select ledger_status into v_status from public.transactions where id = v_c.transaction_mxn_id for update;
  if v_status = 'reversed' then
    return jsonb_build_object('ok', true, 'ya_liberada', true);
  end if;
  if v_status <> 'reserved' then
    raise exception 'La conversión % ya está contabilizada; se ajusta desde backoffice', p_cruce_id;
  end if;
  perform public._ledger_reverse(v_c.transaction_mxn_id, 'liberacion', 'reversed');
  update public.transactions set estado_id = public._estado_movimiento_id('RECHAZADO') where id = v_c.transaction_mxn_id;
  return jsonb_build_object('ok', true, 'ya_liberada', false);
end;
$$;

revoke all on function public.cobre_reintegrar_transferencia(text, text) from public, anon, authenticated;
revoke all on function public.cobre_reservar_cruce(uuid) from public, anon, authenticated;
revoke all on function public.cobre_confirmar_cruce(uuid) from public, anon, authenticated;
revoke all on function public.cobre_liberar_cruce(uuid) from public, anon, authenticated;
revoke all on function public._cobre_cuenta(text, text) from public, anon, authenticated;
grant execute on function public.cobre_reintegrar_transferencia(text, text) to service_role;
grant execute on function public.cobre_reservar_cruce(uuid) to service_role;
grant execute on function public.cobre_confirmar_cruce(uuid) to service_role;
grant execute on function public.cobre_liberar_cruce(uuid) to service_role;
grant execute on function public._cobre_cuenta(text, text) to service_role;

-- Reserva de un envío USD hecha por el servidor (sin sesión): mismas reglas, comisión y saldo que
-- `reservar_transferencia_bdc`, sobre la subcuenta en dólares del comercio.
create or replace function public.cobre_reservar_transferencia(
  p_legajo text,
  p_subcuenta_id uuid,
  p_id_txn text,
  p_destino text,
  p_monto numeric,
  p_destinatario_nombre text,
  p_destinatario_banco text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_cliente_id uuid;
begin
  select id into v_cliente_id from public.clientes where legajo = p_legajo;
  if v_cliente_id is null then
    raise exception 'Cliente % inexistente', p_legajo;
  end if;
  return public._tx_reservar_transferencia(v_cliente_id, p_legajo, p_subcuenta_id, p_id_txn,
    p_destino, p_monto, p_destinatario_nombre, null, p_destinatario_banco);
end;
$$;
revoke all on function public.cobre_reservar_transferencia(text, uuid, text, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.cobre_reservar_transferencia(text, uuid, text, text, numeric, text, text) to service_role;

comment on table public.cobre_lotes is 'Lotes de envíos SPEI (/bulk_money_movements).';
comment on table public.cobre_cobros_r2p is 'Cobros Direct Link R2P SPEI: CLABE dinámica por cobro.';
comment on table public.cobre_cruces is 'Conversiones MXN→USD del comercio (cotización static_quote + Cross Border).';
