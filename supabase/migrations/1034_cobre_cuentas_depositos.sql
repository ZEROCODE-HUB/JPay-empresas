-- Fases C2 y C3 de Cobre: cuentas, CLABE de cada subcuenta y depósitos SPEI.
--
-- Moneda del ledger por país: hasta ahora todo nacía en ARS (default de las columnas). Desde acá:
-- - las cuentas contables de una subcuenta nueva toman la moneda del país del cliente
--   (`clientes.pais` → `paises.moneda`; ARS si no hay dato, como antes);
-- - una transacción con subcuenta toma la moneda de esa subcuenta (antes de insertar).
-- Para Argentina no cambia nada. Cuentas de plataforma en MXN para Cobre: BANCO_COBRE,
-- INGRESOS_COMISIONES_MXN e IVA_DEBITO_FISCAL_MXN.
--
-- Modelo de fondos (decisión C1, los dos): `centralizado` = CLABE virtual sobre el Cobre Balance
-- de JPay (`cobre_configuracion.cuenta_plataforma_id`); `por_comercio` = Cobre Balance propio del
-- cliente (`cobre_cuentas` tipo `cliente`). En ambos casos el saldo de cada subcuenta lo lleva
-- el ledger de JPay y cada subcuenta tiene su CLABE en `cobre_clabes` (y en `subaccounts.cbu`).
--
-- `cobre_registrar_deposito`: acredita un `spei_credit` en la subcuenta dueña de la CLABE, con
-- el mismo asiento y las mismas reglas que `registrar_deposito_entrante` (BDC), idempotente por
-- id de transacción de Cobre. Si la CLABE no es de nadie queda en `cobre_depositos` como
-- `sin_asignar` (no acredita). Solo service role.
-- Aditiva.

-- ── Moneda del ledger por país ──────────────────────────────────────────────
-- Las restricciones solo admitían ARS: se amplían a ARS o MXN (lista cerrada).
alter table public.ledger_accounts drop constraint if exists ledger_accounts_currency_code_check;
alter table public.ledger_accounts add constraint ledger_accounts_currency_code_check
  check (currency_code in ('ARS', 'MXN'));
alter table public.ledger_entries drop constraint if exists ledger_entries_currency_code_check;
alter table public.ledger_entries add constraint ledger_entries_currency_code_check
  check (currency_code in ('ARS', 'MXN'));
alter table public.transactions drop constraint if exists transactions_currency_code_check;
alter table public.transactions add constraint transactions_currency_code_check
  check (currency_code in ('ARS', 'MXN'));

create or replace function public.tg_subaccounts_init_balance()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_moneda char(3);
begin
  select p.moneda into v_moneda
    from public.clientes c join public.paises p on p.codigo = c.pais
   where c.legajo = NEW.cliente_legajo;
  insert into public.subaccount_balances (subaccount_id) values (NEW.id);
  insert into public.ledger_accounts (account_code, name, account_type, subaccount_id, balance_bucket, currency_code)
  select 'SUB-' || NEW.id || '-' || upper(b.bucket),
         'Fondos ' || b.bucket || ' · ' || NEW.cliente_legajo || ' · ' || coalesce(nullif(NEW.nombre, ''), NEW.tipo),
         'liability', NEW.id, b.bucket, coalesce(v_moneda, 'ARS')
    from (values ('disponible'), ('retenido')) b(bucket);
  return null;
end;
$$;

create or replace function public.tg_transactions_moneda()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_moneda char(3);
begin
  if NEW.subcuenta_id is not null then
    select currency_code into v_moneda from public.ledger_accounts
     where subaccount_id = NEW.subcuenta_id limit 1;
    if v_moneda is not null then
      NEW.currency_code := v_moneda;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists transactions_moneda on public.transactions;
create trigger transactions_moneda before insert on public.transactions
  for each row execute function public.tg_transactions_moneda();

insert into public.ledger_accounts (account_code, name, account_type, currency_code) values
  ('BANCO_COBRE', 'Cuenta recaudadora en Cobre (México)', 'asset', 'MXN'),
  ('INGRESOS_COMISIONES_MXN', 'Ingresos por comisiones (MXN)', 'revenue', 'MXN'),
  ('IVA_DEBITO_FISCAL_MXN', 'IVA trasladado a pagar (MXN)', 'liability', 'MXN')
on conflict (account_code) do nothing;

-- ── Configuración, cuentas y CLABEs ─────────────────────────────────────────
create table if not exists public.cobre_cuentas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('plataforma', 'cliente')),
  cliente_legajo text references public.clientes (legajo) on delete restrict,
  modo text not null check (modo in ('simulado', 'prueba', 'produccion')),
  cuenta_externa_id text not null,
  clabe text,
  alias text,
  estado text not null default 'activa' check (estado in ('activa', 'cerrada')),
  created_at timestamptz not null default now(),
  unique (modo, cuenta_externa_id),
  check ((tipo = 'cliente') = (cliente_legajo is not null))
);
create unique index if not exists cobre_cuentas_cliente_key
  on public.cobre_cuentas (modo, cliente_legajo) where tipo = 'cliente' and estado = 'activa';

create table if not exists public.cobre_configuracion (
  id smallint primary key default 1 check (id = 1),
  modelo_default text not null default 'centralizado'
    check (modelo_default in ('centralizado', 'por_comercio')),
  monto_aprobacion numeric(14, 2) check (monto_aprobacion is null or monto_aprobacion > 0),
  cuenta_plataforma_id uuid references public.cobre_cuentas (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.cobre_configuracion (id) values (1) on conflict do nothing;

-- Modelo de fondos por cliente (sin fila = el default de la configuración).
create table if not exists public.cobre_clientes (
  cliente_legajo text primary key references public.clientes (legajo) on delete cascade,
  modelo_fondos text not null check (modelo_fondos in ('centralizado', 'por_comercio')),
  updated_at timestamptz not null default now()
);

create table if not exists public.cobre_clabes (
  id uuid primary key default gen_random_uuid(),
  subcuenta_id uuid not null references public.subaccounts (id) on delete restrict,
  cliente_legajo text not null,
  cuenta_id uuid not null references public.cobre_cuentas (id) on delete restrict,
  modo text not null check (modo in ('simulado', 'prueba', 'produccion')),
  clabe text not null check (clabe ~ '^[0-9]{18}$'),
  -- ref_… si es CLABE virtual; null si es la CLABE propia de un Cobre Balance (por_comercio).
  referencia_externa_id text,
  estado text not null default 'activa' check (estado in ('activa', 'deshabilitada')),
  created_at timestamptz not null default now(),
  deshabilitada_at timestamptz
);
create unique index if not exists cobre_clabes_clabe_key on public.cobre_clabes (modo, clabe);
create unique index if not exists cobre_clabes_subcuenta_activa_key
  on public.cobre_clabes (modo, subcuenta_id) where estado = 'activa';

create table if not exists public.cobre_depositos (
  id uuid primary key default gen_random_uuid(),
  modo text not null check (modo in ('simulado', 'prueba', 'produccion')),
  transaccion_externa_id text not null,
  cuenta_externa_id text,
  clabe text,
  monto numeric(14, 2) not null check (monto > 0),
  remitente text,
  remitente_cuenta text,
  remitente_id text,
  clave_rastreo text,
  cep text,
  estado text not null check (estado in ('acreditado', 'sin_asignar', 'devuelto')),
  subcuenta_id uuid references public.subaccounts (id) on delete set null,
  cliente_legajo text,
  transaction_id uuid references public.transactions (id) on delete set null,
  recibido_at timestamptz not null default now(),
  fecha_operacion timestamptz,
  unique (modo, transaccion_externa_id)
);
create index if not exists cobre_depositos_estado_idx on public.cobre_depositos (estado, recibido_at desc);

-- RLS: backoffice ve todo; el cliente ve lo suyo. Escriben solo Edge Functions y RPC.
alter table public.cobre_cuentas enable row level security;
alter table public.cobre_configuracion enable row level security;
alter table public.cobre_clientes enable row level security;
alter table public.cobre_clabes enable row level security;
alter table public.cobre_depositos enable row level security;
revoke all on public.cobre_cuentas, public.cobre_configuracion, public.cobre_clientes,
  public.cobre_clabes, public.cobre_depositos from anon;
revoke insert, update, delete on public.cobre_cuentas, public.cobre_clabes, public.cobre_depositos
  from authenticated;
grant select on public.cobre_cuentas, public.cobre_configuracion, public.cobre_clientes,
  public.cobre_clabes, public.cobre_depositos to authenticated;
grant update on public.cobre_configuracion to authenticated;
grant insert, update, delete on public.cobre_clientes to authenticated;

drop policy if exists cobre_cuentas_select on public.cobre_cuentas;
create policy cobre_cuentas_select on public.cobre_cuentas for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());
drop policy if exists cobre_clabes_select on public.cobre_clabes;
create policy cobre_clabes_select on public.cobre_clabes for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());
drop policy if exists cobre_depositos_select on public.cobre_depositos;
create policy cobre_depositos_select on public.cobre_depositos for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());
drop policy if exists cobre_configuracion_select on public.cobre_configuracion;
create policy cobre_configuracion_select on public.cobre_configuracion for select to authenticated
  using (public.es_backoffice());
drop policy if exists cobre_configuracion_update on public.cobre_configuracion;
create policy cobre_configuracion_update on public.cobre_configuracion for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists cobre_clientes_select on public.cobre_clientes;
create policy cobre_clientes_select on public.cobre_clientes for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());
drop policy if exists cobre_clientes_admin on public.cobre_clientes;
create policy cobre_clientes_admin on public.cobre_clientes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── Depósitos ───────────────────────────────────────────────────────────────
create or replace function public.cobre_registrar_deposito(
  p_modo text,
  p_transaccion_id text,
  p_cuenta_externa_id text,
  p_clabe text,
  p_monto numeric,
  p_remitente text default null,
  p_remitente_cuenta text default null,
  p_remitente_id text default null,
  p_clave_rastreo text default null,
  p_cep text default null,
  p_fecha timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_txn text := 'COBRE-' || trim(p_transaccion_id);
  v_dep public.cobre_depositos;
  v_sub uuid;
  v_legajo text;
  v_cliente_id uuid;
  v_tx_id uuid;
  v_comision numeric := 0;
  v_impuesto numeric := 0;
  v_pct_iva numeric;
  v_eval jsonb;
  v_block uuid;
  v_bucket text := 'disponible';
begin
  if p_transaccion_id is null or length(trim(p_transaccion_id)) = 0 then
    raise exception 'Falta el id de la transacción de Cobre';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto <> round(p_monto, 2) then
    raise exception 'Importe inválido';
  end if;

  select * into v_dep from public.cobre_depositos
   where modo = p_modo and transaccion_externa_id = trim(p_transaccion_id) for update;
  if found and v_dep.estado <> 'sin_asignar' then
    return jsonb_build_object('estado', 'ya_registrado', 'deposito_id', v_dep.id);
  end if;

  select c.subcuenta_id, c.cliente_legajo into v_sub, v_legajo
    from public.cobre_clabes c
   where c.modo = p_modo and c.clabe = trim(coalesce(p_clabe, '')) and c.estado = 'activa';

  if not found then
    insert into public.cobre_depositos (
      modo, transaccion_externa_id, cuenta_externa_id, clabe, monto, remitente, remitente_cuenta,
      remitente_id, clave_rastreo, cep, estado, fecha_operacion
    ) values (
      p_modo, trim(p_transaccion_id), p_cuenta_externa_id, p_clabe, p_monto, p_remitente,
      p_remitente_cuenta, p_remitente_id, p_clave_rastreo, p_cep, 'sin_asignar', p_fecha
    ) on conflict (modo, transaccion_externa_id) do nothing;
    return jsonb_build_object('estado', 'sin_asignar', 'clabe', p_clabe);
  end if;

  select id into v_cliente_id from public.clientes where legajo = v_legajo;
  perform public._lock_cliente_reglas(v_cliente_id);

  select k.comision, k.impuesto into v_comision, v_impuesto
    from public.calcular_comision(v_cliente_id, p_monto, v_sub, 'Depósito', null) k;
  v_comision := coalesce(v_comision, 0);
  v_impuesto := coalesce(v_impuesto, 0);
  if v_comision + v_impuesto > p_monto then
    v_pct_iva := case when v_comision > 0 then v_impuesto * 100 / v_comision else 0 end;
    v_comision := round(p_monto * 100 / (100 + v_pct_iva), 2);
    v_impuesto := p_monto - v_comision;
  end if;

  insert into public.transactions (
    cliente_id, legajo, id_txn, tipo, cvu, subcuenta_id, destinatario_nombre, destinatario_cuit,
    monto_operacion, comision, impuesto, monto_cobrado, estado_id, fecha
  ) values (
    v_cliente_id, v_legajo, v_txn, 'deposito', coalesce(nullif(trim(p_remitente_cuenta), ''), trim(p_clabe)),
    v_sub, nullif(trim(coalesce(p_remitente, '')), ''), nullif(trim(coalesce(p_remitente_id, '')), ''),
    p_monto, v_comision, v_impuesto, v_comision + v_impuesto,
    public._estado_movimiento_id('APROBADO'), coalesce(p_fecha, now())
  )
  on conflict (id_txn) do nothing
  returning id into v_tx_id;
  if v_tx_id is null then
    return jsonb_build_object('estado', 'ya_registrado', 'id_txn', v_txn);
  end if;

  v_eval := public.evaluar_reglas_operacion(v_tx_id, 'deposit');
  v_block := public._bloqueo_activo(v_cliente_id, v_sub);
  if v_block is null and v_eval ->> 'decision' = 'block' then
    v_block := public._registrar_bloqueo_regla(v_cliente_id, (v_eval ->> 'block_rule_id')::uuid,
      (v_eval ->> 'block_alert_id')::uuid, v_tx_id, v_eval ->> 'block_reason');
  end if;
  if v_block is not null then
    v_bucket := 'retenido';
    update public.transactions set held_block_id = v_block where id = v_tx_id;
  end if;

  perform public.ledger_post(v_tx_id, 'acreditacion', public._ledger_lines(
    public._ledger_line(public._ledger_account_id('BANCO_COBRE'), 'debit', p_monto),
    public._ledger_line(public._ledger_sub_account_id(v_sub, v_bucket), 'credit', p_monto),
    public._ledger_line(public._ledger_sub_account_id(v_sub, v_bucket), 'debit', v_comision, 'comision'),
    public._ledger_line(public._ledger_account_id('INGRESOS_COMISIONES_MXN'), 'credit', v_comision, 'comision'),
    public._ledger_line(public._ledger_sub_account_id(v_sub, v_bucket), 'debit', v_impuesto, 'impuesto'),
    public._ledger_line(public._ledger_account_id('IVA_DEBITO_FISCAL_MXN'), 'credit', v_impuesto, 'impuesto')
  ), 'posted');

  insert into public.cobre_depositos (
    modo, transaccion_externa_id, cuenta_externa_id, clabe, monto, remitente, remitente_cuenta,
    remitente_id, clave_rastreo, cep, estado, subcuenta_id, cliente_legajo, transaction_id, fecha_operacion
  ) values (
    p_modo, trim(p_transaccion_id), p_cuenta_externa_id, p_clabe, p_monto, p_remitente,
    p_remitente_cuenta, p_remitente_id, p_clave_rastreo, p_cep, 'acreditado', v_sub, v_legajo,
    v_tx_id, p_fecha
  )
  on conflict (modo, transaccion_externa_id) do update set
    estado = 'acreditado', subcuenta_id = excluded.subcuenta_id,
    cliente_legajo = excluded.cliente_legajo, transaction_id = excluded.transaction_id;

  return jsonb_build_object('estado', 'acreditado', 'id_txn', v_txn, 'legajo', v_legajo,
    'subcuenta_id', v_sub, 'importe', p_monto, 'comision', v_comision, 'impuesto', v_impuesto,
    'retenido', v_bucket = 'retenido', 'decision', v_eval ->> 'decision');
end;
$$;

revoke all on function public.cobre_registrar_deposito(text, text, text, text, numeric, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.cobre_registrar_deposito(text, text, text, text, numeric, text, text, text, text, text, timestamptz)
  to service_role;

comment on table public.cobre_clabes is 'CLABE de recepción de cada subcuenta en Cobre (virtual o de su Cobre Balance).';
comment on table public.cobre_depositos is 'Depósitos SPEI recibidos en Cobre: acreditados, sin asignar o devueltos.';
