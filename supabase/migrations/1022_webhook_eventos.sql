-- Fase 5 de Ecart Pay: avisos automáticos (webhooks).
--
-- `webhook_eventos`: todo aviso recibido (firmado o no) queda registrado. Un aviso nunca cambia
-- un estado por su contenido: solo dispara la consulta de la orden al proveedor. El mismo
-- `webhook_id` firmado se procesa una sola vez (índice único parcial).
-- `tareas_programadas`: marca de la última corrida de tareas públicas (para limitar frecuencia).
-- Aditiva.

create table if not exists public.webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null references public.proveedores_pago (codigo) on update cascade,
  origen text not null check (origen in ('webhook', 'notify_url')),
  webhook_id text,
  evento text,
  id_externo text,
  estado_externo text,
  firma_valida boolean,
  payload jsonb not null default '{}'::jsonb,
  pago_id uuid references public.pagos (id) on delete set null,
  resultado text,
  error text,
  intentos integer not null default 0,
  recibido_at timestamptz not null default now(),
  procesado_at timestamptz
);

create unique index if not exists webhook_eventos_webhook_id_key
  on public.webhook_eventos (proveedor, webhook_id)
  where webhook_id is not null and firma_valida;
create index if not exists webhook_eventos_recibido_idx
  on public.webhook_eventos (recibido_at desc);
create index if not exists webhook_eventos_externo_idx
  on public.webhook_eventos (proveedor, id_externo);

alter table public.webhook_eventos enable row level security;
revoke all on public.webhook_eventos from anon;
revoke insert, update, delete on public.webhook_eventos from authenticated;
grant select on public.webhook_eventos to authenticated;
drop policy if exists webhook_eventos_select on public.webhook_eventos;
create policy webhook_eventos_select on public.webhook_eventos
  for select to authenticated using (public.es_backoffice());

comment on table public.webhook_eventos is
  'Avisos de proveedores de pago (webhooks y notify_url). Solo los escriben las Edge Functions.';

create table if not exists public.tareas_programadas (
  nombre text primary key,
  ultima_corrida_at timestamptz,
  resultado jsonb not null default '{}'::jsonb
);
alter table public.tareas_programadas enable row level security;
revoke all on public.tareas_programadas from anon, authenticated;
grant select on public.tareas_programadas to authenticated;
drop policy if exists tareas_programadas_select on public.tareas_programadas;
create policy tareas_programadas_select on public.tareas_programadas
  for select to authenticated using (public.es_backoffice());

-- Reserva atómica de una corrida: true si pasaron al menos `p_intervalo` desde la anterior.
create or replace function public.reservar_tarea(p_nombre text, p_intervalo interval)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ok boolean;
begin
  insert into public.tareas_programadas (nombre, ultima_corrida_at)
  values (p_nombre, now())
  on conflict (nombre) do update set ultima_corrida_at = now()
  where public.tareas_programadas.ultima_corrida_at is null
     or public.tareas_programadas.ultima_corrida_at < now() - p_intervalo
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke execute on function public.reservar_tarea(text, interval) from public, anon, authenticated;
grant execute on function public.reservar_tarea(text, interval) to service_role;
