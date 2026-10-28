-- Fase C4 de Cobre: transferencias SPEI salientes.
--
-- Flujo (Edge Function `cobre-transferencias`): OTP (si `exigir_otp`) → reserva en el ledger con
-- `reservar_transferencia_bdc` (mismas reglas, comisión, bloqueos y saldo que BDC; disponible →
-- retenido) → money movement en Cobre con idempotencia = TXID → estado por webhook o consulta:
--   completed            → `cobre_confirmar_transferencia` (retenido → BANCO_COBRE + comisión)
--   rejected/failed/canceled → `cancelar_transferencia_bdc` (libera la reserva)
-- Sobre `monto_aprobacion` la transferencia va con `checker_approval` y queda pendiente hasta que
-- un admin la aprueba o la rechaza (decisión que se le manda a Cobre).
-- Aditiva.

alter table public.cobre_configuracion
  add column if not exists exigir_otp boolean not null default false;

create table if not exists public.cobre_contrapartes (
  id uuid primary key default gen_random_uuid(),
  cliente_legajo text not null references public.clientes (legajo) on delete cascade,
  modo text not null check (modo in ('simulado', 'prueba', 'produccion')),
  tipo text not null check (tipo in ('clabe', 'spei_card')),
  numero text not null check (numero ~ '^[0-9]{15,18}$'),
  banco text,
  titular text not null,
  id_tipo text not null check (id_tipo in ('rfc', 'curp')),
  id_numero text not null,
  alias text,
  contraparte_externa_id text not null,
  verificacion_externa_id text,
  verificacion text not null default 'sin_verificar'
    check (verificacion in ('sin_verificar', 'procesando', 'matched', 'unmatched', 'unresolved')),
  verificado_at timestamptz,
  created_at timestamptz not null default now(),
  unique (modo, cliente_legajo, numero, id_numero)
);

create table if not exists public.cobre_transferencias (
  id uuid primary key default gen_random_uuid(),
  modo text not null check (modo in ('simulado', 'prueba', 'produccion')),
  id_txn text not null unique,
  transaction_id uuid references public.transactions (id) on delete set null,
  cliente_legajo text not null,
  subcuenta_id uuid not null references public.subaccounts (id) on delete restrict,
  contraparte_id uuid not null references public.cobre_contrapartes (id) on delete restrict,
  cuenta_origen_externa_id text not null,
  monto numeric(14, 2) not null check (monto > 0),
  concepto text,
  mm_id text unique,
  estado text not null default 'enviando' check (estado in (
    'enviando', 'pendiente', 'pendiente_aprobacion', 'completada', 'rechazada', 'fallida',
    'cancelada', 'error_envio'
  )),
  codigo text,
  motivo text,
  clave_rastreo text,
  cep text,
  requiere_aprobacion boolean not null default false,
  aprobacion_externa_id text,
  decidida_por text,
  decidida_at timestamptz,
  nota_decision text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cobre_transferencias_estado_idx
  on public.cobre_transferencias (estado, updated_at);
create index if not exists cobre_transferencias_cliente_idx
  on public.cobre_transferencias (cliente_legajo, created_at desc);

alter table public.cobre_contrapartes enable row level security;
alter table public.cobre_transferencias enable row level security;
revoke all on public.cobre_contrapartes, public.cobre_transferencias from anon;
revoke insert, update, delete on public.cobre_contrapartes, public.cobre_transferencias from authenticated;
grant select on public.cobre_contrapartes, public.cobre_transferencias to authenticated;
drop policy if exists cobre_contrapartes_select on public.cobre_contrapartes;
create policy cobre_contrapartes_select on public.cobre_contrapartes for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());
drop policy if exists cobre_transferencias_select on public.cobre_transferencias;
create policy cobre_transferencias_select on public.cobre_transferencias for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());

-- Contabiliza una transferencia completada en Cobre (como `_tx_confirmar_transferencia`, en MXN).
create or replace function public.cobre_confirmar_transferencia(p_id_txn text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tx record;
begin
  select id, id_txn, subcuenta_id, ledger_status, monto_operacion, comision, impuesto
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
    public._ledger_line(public._ledger_account_id('BANCO_COBRE'), 'credit', v_tx.monto_operacion),
    public._ledger_line(public._ledger_account_id('INGRESOS_COMISIONES_MXN'), 'credit', v_tx.comision, 'comision'),
    public._ledger_line(public._ledger_account_id('IVA_DEBITO_FISCAL_MXN'), 'credit', v_tx.impuesto, 'impuesto')
  ), 'posted');

  update public.transactions set estado_id = public._estado_movimiento_id('APROBADO') where id = v_tx.id;
  return jsonb_build_object('ok', true, 'ya_registrada', false, 'id_txn', v_tx.id_txn,
    'total_debitado', v_tx.monto_operacion + v_tx.comision + v_tx.impuesto);
end;
$$;

revoke all on function public.cobre_confirmar_transferencia(text) from public, anon, authenticated;
grant execute on function public.cobre_confirmar_transferencia(text) to service_role;

comment on table public.cobre_transferencias is
  'Transferencias SPEI enviadas por Cobre: TXID de JPay ↔ money movement, estado y motivo.';
comment on table public.cobre_contrapartes is
  'Destinatarios SPEI (CLABE o tarjeta) registrados en Cobre, con verificación de titularidad.';

-- Revisión de pendientes de Cobre cada 5 minutos (transferencias abiertas y verificaciones).
select cron.unschedule(jobid) from cron.job where jobname = 'cobre-pendientes';
select cron.schedule(
  'cobre-pendientes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ovbozgezuboftcjwxlwj.supabase.co/functions/v1/cobre-pendientes',
    headers := '{"content-type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
