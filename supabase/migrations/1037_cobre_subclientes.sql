-- Cobre según el Solution Design de JPAY (2026-10-26), fases D0 y D1.
--
-- Modelo: un Subcliente (`sc_…`, alta KYB del comercio) y un Cobre Balance México
-- (`pr_mex_cobre3`, creado con `subclient_id`) por comercio. Sin balance concentrador: el modelo
-- `centralizado` y las CLABEs virtuales quedan sin uso (las tablas siguen para el historial).
-- La CLABE del Balance (`account_number`) llega a la subcuenta receptora del comercio
-- (`cobre_cuentas.subcuenta_id`; por defecto la subcuenta activa más antigua).
--
-- - `cobre_instancias`: excepción del documento, comercio con instancia Cobre propia. Sus
--   credenciales y su clave de avisos viven en Vault; solo el service role las lee.
-- - Datos KYB del Subcliente que faltaban: sitio web, industria, países de constitución y de
--   operación (ISO alfa-3) en `clientes`; representantes legales y beneficiarios finales en
--   `cliente_personas_kyb`.
-- - `cobre_subclientes`: cada alta enviada a Cobre. Un `rejected` no se reenvía: se crea otra fila.
-- - `cobre_cuentas`: Balances de comercio, Global USD y USA de la instancia matriz.
-- - `cobre_registrar_deposito`: si la CLABE no es conocida, asigna por el Balance que recibió
--   (`account_id`); admite subcuenta explícita (cobros R2P) y origen del depósito.
-- Aditiva.

-- ── Instancias Cobre propias de un comercio ─────────────────────────────────
create table if not exists public.cobre_instancias (
  id uuid primary key default gen_random_uuid(),
  cliente_legajo text not null references public.clientes (legajo) on delete restrict,
  modo text not null check (modo in ('simulado', 'prueba', 'produccion')),
  base_url text,
  user_id text not null,
  secreto_ref uuid,
  clave_webhook_ref uuid,
  suscripcion_id text,
  estado text not null default 'activa' check (estado in ('activa', 'inactiva')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists cobre_instancias_cliente_key
  on public.cobre_instancias (modo, cliente_legajo) where estado = 'activa';

alter table public.cobre_instancias enable row level security;
revoke all on public.cobre_instancias from anon;
revoke insert, update, delete on public.cobre_instancias from authenticated;
grant select on public.cobre_instancias to authenticated;
drop policy if exists cobre_instancias_select on public.cobre_instancias;
create policy cobre_instancias_select on public.cobre_instancias for select to authenticated
  using (public.es_backoffice());

-- Guarda (o reemplaza) el secret y la clave de avisos de la instancia en Vault.
create or replace function public.cobre_instancia_guardar_secretos(
  p_instancia_id uuid,
  p_secret text,
  p_clave_webhook text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_inst public.cobre_instancias;
begin
  select * into v_inst from public.cobre_instancias where id = p_instancia_id for update;
  if not found then
    raise exception 'Instancia % inexistente', p_instancia_id;
  end if;
  if p_secret is not null then
    if v_inst.secreto_ref is not null and exists (select 1 from vault.secrets where id = v_inst.secreto_ref) then
      perform vault.update_secret(v_inst.secreto_ref, p_secret);
    else
      update public.cobre_instancias
         set secreto_ref = vault.create_secret(p_secret, 'cobre_instancia_secret_' || p_instancia_id::text,
                                               'Secret de la instancia Cobre del comercio')
       where id = p_instancia_id;
    end if;
  end if;
  if p_clave_webhook is not null then
    if v_inst.clave_webhook_ref is not null and exists (select 1 from vault.secrets where id = v_inst.clave_webhook_ref) then
      perform vault.update_secret(v_inst.clave_webhook_ref, p_clave_webhook);
    else
      update public.cobre_instancias
         set clave_webhook_ref = vault.create_secret(p_clave_webhook, 'cobre_instancia_webhook_' || p_instancia_id::text,
                                                     'event_signature_key de la instancia Cobre del comercio')
       where id = p_instancia_id;
    end if;
  end if;
  update public.cobre_instancias set updated_at = now() where id = p_instancia_id;
end;
$$;

-- Credenciales en claro para operar con la instancia (solo Edge Functions).
create or replace function public.cobre_instancia_leer(p_instancia_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'id', i.id, 'cliente_legajo', i.cliente_legajo, 'modo', i.modo, 'base_url', i.base_url,
    'user_id', i.user_id, 'estado', i.estado,
    'secret', (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = i.secreto_ref),
    'clave_webhook', (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = i.clave_webhook_ref)
  )
  from public.cobre_instancias i
  where i.id = p_instancia_id;
$$;

revoke all on function public.cobre_instancia_guardar_secretos(uuid, text, text) from public, anon, authenticated;
revoke all on function public.cobre_instancia_leer(uuid) from public, anon, authenticated;
grant execute on function public.cobre_instancia_guardar_secretos(uuid, text, text) to service_role;
grant execute on function public.cobre_instancia_leer(uuid) to service_role;

-- ── Datos KYB del comercio ──────────────────────────────────────────────────
alter table public.clientes
  add column if not exists sitio_web text,
  add column if not exists industria_cobre text,
  add column if not exists pais_constitucion text check (pais_constitucion is null or pais_constitucion ~ '^[A-Z]{3}$'),
  add column if not exists pais_operacion text check (pais_operacion is null or pais_operacion ~ '^[A-Z]{3}$');

create table if not exists public.cliente_personas_kyb (
  id uuid primary key default gen_random_uuid(),
  cliente_legajo text not null references public.clientes (legajo) on delete cascade,
  rol text not null check (rol in ('representante', 'beneficiario')),
  nombre text not null check (length(trim(nombre)) > 0),
  apellido text not null check (length(trim(apellido)) > 0),
  id_tipo text not null check (id_tipo in ('rfc', 'curp')),
  id_numero text not null check (id_numero ~ '^[A-Z0-9&Ñ]{10,18}$'),
  nacionalidades text[] not null default '{MEX}'
    check (cardinality(nacionalidades) > 0),
  fecha_nacimiento date not null,
  porcentaje numeric(5, 2) check (porcentaje is null or (porcentaje > 0 and porcentaje <= 100)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cliente_personas_kyb_cliente_idx on public.cliente_personas_kyb (cliente_legajo, rol);

alter table public.cliente_personas_kyb enable row level security;
revoke all on public.cliente_personas_kyb from anon;
grant select, insert, update, delete on public.cliente_personas_kyb to authenticated;
drop policy if exists cliente_personas_kyb_select on public.cliente_personas_kyb;
create policy cliente_personas_kyb_select on public.cliente_personas_kyb for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());
drop policy if exists cliente_personas_kyb_escribir on public.cliente_personas_kyb;
create policy cliente_personas_kyb_escribir on public.cliente_personas_kyb for all to authenticated
  using (public.is_admin() or cliente_legajo = public.current_cliente_legajo())
  with check (public.is_admin() or cliente_legajo = public.current_cliente_legajo());

-- ── Subclientes ─────────────────────────────────────────────────────────────
create table if not exists public.cobre_subclientes (
  id uuid primary key default gen_random_uuid(),
  cliente_legajo text not null references public.clientes (legajo) on delete restrict,
  modo text not null check (modo in ('simulado', 'prueba', 'produccion')),
  subcliente_externo_id text,
  -- `enviando`: guardado antes de llamar (con su Idempotency-Key); `error_envio`: Cobre lo rechazó
  -- al validar (se corrige y se crea otro).
  estado text not null default 'enviando'
    check (estado in ('enviando', 'error_envio', 'processing', 'approved', 'rejected', 'failed')),
  motivo text,
  idempotency_key text not null unique,
  datos_enviados jsonb not null,
  creado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (modo, subcliente_externo_id)
);
create unique index if not exists cobre_subclientes_vigente_key
  on public.cobre_subclientes (modo, cliente_legajo)
  where estado in ('enviando', 'processing', 'approved');

alter table public.cobre_subclientes enable row level security;
revoke all on public.cobre_subclientes from anon;
revoke insert, update, delete on public.cobre_subclientes from authenticated;
grant select on public.cobre_subclientes to authenticated;
drop policy if exists cobre_subclientes_select on public.cobre_subclientes;
create policy cobre_subclientes_select on public.cobre_subclientes for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());

-- ── Balances: del comercio, Global USD y USA de la instancia matriz ─────────
alter table public.cobre_cuentas drop constraint if exists cobre_cuentas_tipo_check;
alter table public.cobre_cuentas add constraint cobre_cuentas_tipo_check
  check (tipo in ('plataforma', 'cliente', 'global', 'usa'));
alter table public.cobre_cuentas
  add column if not exists proveedor_id text not null default 'pr_mex_cobre3',
  add column if not exists moneda text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  add column if not exists subcliente_id uuid references public.cobre_subclientes (id) on delete set null,
  add column if not exists instancia_id uuid references public.cobre_instancias (id) on delete restrict,
  add column if not exists subcuenta_id uuid references public.subaccounts (id) on delete set null,
  add column if not exists conectividad text;
create unique index if not exists cobre_cuentas_matriz_key
  on public.cobre_cuentas (modo, tipo) where tipo in ('global', 'usa') and estado = 'activa';

alter table public.cobre_configuracion
  add column if not exists cuenta_global_id uuid references public.cobre_cuentas (id) on delete set null,
  add column if not exists cuenta_usa_id uuid references public.cobre_cuentas (id) on delete set null;

-- Suscripciones de avisos (una por instancia: null = matriz).
create table if not exists public.cobre_suscripciones (
  id uuid primary key default gen_random_uuid(),
  modo text not null check (modo in ('simulado', 'prueba', 'produccion')),
  instancia_id uuid references public.cobre_instancias (id) on delete cascade,
  suscripcion_externa_id text not null,
  url text not null,
  eventos text[] not null,
  created_at timestamptz not null default now()
);
create unique index if not exists cobre_suscripciones_key
  on public.cobre_suscripciones (modo, coalesce(instancia_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.cobre_suscripciones enable row level security;
revoke all on public.cobre_suscripciones from anon;
revoke insert, update, delete on public.cobre_suscripciones from authenticated;
grant select on public.cobre_suscripciones to authenticated;
drop policy if exists cobre_suscripciones_select on public.cobre_suscripciones;
create policy cobre_suscripciones_select on public.cobre_suscripciones for select to authenticated
  using (public.es_backoffice());

-- ── Depósitos: asignación por Balance y origen ──────────────────────────────
alter table public.cobre_depositos
  add column if not exists origen text not null default 'spei' check (origen in ('spei', 'r2p'));

drop function if exists public.cobre_registrar_deposito(text, text, text, text, numeric, text, text, text, text, text, timestamptz);

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
  p_fecha timestamptz default null,
  p_subcuenta_id uuid default null,
  p_origen text default 'spei'
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
  if p_origen not in ('spei', 'r2p') then
    raise exception 'Origen inválido';
  end if;

  select * into v_dep from public.cobre_depositos
   where modo = p_modo and transaccion_externa_id = trim(p_transaccion_id) for update;
  if found and v_dep.estado <> 'sin_asignar' then
    return jsonb_build_object('estado', 'ya_registrado', 'deposito_id', v_dep.id);
  end if;

  -- 1) Subcuenta explícita (cobro R2P). 2) CLABE conocida. 3) Balance del comercio que recibió.
  if p_subcuenta_id is not null then
    select s.id, s.cliente_legajo into v_sub, v_legajo from public.subaccounts s where s.id = p_subcuenta_id;
  end if;
  if v_sub is null then
    select c.subcuenta_id, c.cliente_legajo into v_sub, v_legajo
      from public.cobre_clabes c
     where c.modo = p_modo and c.clabe = trim(coalesce(p_clabe, '')) and c.estado = 'activa';
  end if;
  if v_sub is null and p_cuenta_externa_id is not null then
    select coalesce(k.subcuenta_id, (
             select s.id from public.subaccounts s
              where s.cliente_legajo = k.cliente_legajo and s.estado = 'Activa'
              order by s.created_at limit 1)),
           k.cliente_legajo
      into v_sub, v_legajo
      from public.cobre_cuentas k
     where k.modo = p_modo and k.cuenta_externa_id = trim(p_cuenta_externa_id)
       and k.tipo = 'cliente' and k.estado = 'activa';
  end if;

  if v_sub is null then
    insert into public.cobre_depositos (
      modo, transaccion_externa_id, cuenta_externa_id, clabe, monto, remitente, remitente_cuenta,
      remitente_id, clave_rastreo, cep, estado, fecha_operacion, origen
    ) values (
      p_modo, trim(p_transaccion_id), p_cuenta_externa_id, p_clabe, p_monto, p_remitente,
      p_remitente_cuenta, p_remitente_id, p_clave_rastreo, p_cep, 'sin_asignar', p_fecha, p_origen
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
    v_cliente_id, v_legajo, v_txn, 'deposito', coalesce(nullif(trim(p_remitente_cuenta), ''), trim(coalesce(p_clabe, ''))),
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
    remitente_id, clave_rastreo, cep, estado, subcuenta_id, cliente_legajo, transaction_id,
    fecha_operacion, origen
  ) values (
    p_modo, trim(p_transaccion_id), p_cuenta_externa_id, p_clabe, p_monto, p_remitente,
    p_remitente_cuenta, p_remitente_id, p_clave_rastreo, p_cep, 'acreditado', v_sub, v_legajo,
    v_tx_id, p_fecha, p_origen
  )
  on conflict (modo, transaccion_externa_id) do update set
    estado = 'acreditado', subcuenta_id = excluded.subcuenta_id,
    cliente_legajo = excluded.cliente_legajo, transaction_id = excluded.transaction_id;

  return jsonb_build_object('estado', 'acreditado', 'id_txn', v_txn, 'legajo', v_legajo,
    'subcuenta_id', v_sub, 'transaction_id', v_tx_id, 'importe', p_monto, 'comision', v_comision,
    'impuesto', v_impuesto, 'retenido', v_bucket = 'retenido', 'decision', v_eval ->> 'decision');
end;
$$;

revoke all on function public.cobre_registrar_deposito(text, text, text, text, numeric, text, text, text, text, text, timestamptz, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cobre_registrar_deposito(text, text, text, text, numeric, text, text, text, text, text, timestamptz, uuid, text)
  to service_role;

comment on table public.cobre_subclientes is 'Altas KYB de comercios en Cobre (Subclientes, Named Accounts).';
comment on table public.cliente_personas_kyb is 'Representantes legales y beneficiarios finales del comercio (KYB).';
comment on table public.cobre_instancias is 'Comercios con instancia Cobre propia (excepción del Solution Design); secretos en Vault.';
