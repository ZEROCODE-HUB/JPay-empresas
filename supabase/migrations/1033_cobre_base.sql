-- Fase C1 de Cobre: base y simulador.
--
-- - Proveedor `cobre` (México, cuentas y transferencias SPEI). Arranca en sandbox: mientras
--   Cobre no entregue la instancia de prueba, las Edge Functions usan el simulador
--   (`COBRE_MODO` sin definir = `simulado`).
-- - Módulo `transferencias_cobre` en `paises.modulos` (México sí, Argentina no).
-- - `cobre_simulador`: almacén del simulador (cuentas, CLABEs, contrapartes, transferencias,
--   transacciones y eventos en cola). Solo service role. No se usa en modo prueba/producción.
-- - pg_cron cada minuto: `cobre-simulador` hace avanzar los estados y envía los webhooks
--   firmados a `cobre-webhook` (en modo prueba/producción no hace nada).
-- Aditiva.

insert into public.proveedores_pago (codigo, nombre, pais, tipos, activo, sandbox)
values ('cobre', 'Cobre', 'MX', '{transferencia}', true, true)
on conflict (codigo) do nothing;

update public.paises
set modulos = '{"transferencias_cobre":true}'::jsonb || modulos, updated_at = now()
where codigo = 'MX';
update public.paises
set modulos = '{"transferencias_cobre":false}'::jsonb || modulos, updated_at = now()
where codigo = 'AR';

create table if not exists public.cobre_simulador (
  tipo text not null,
  id text not null,
  datos jsonb not null,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  primary key (tipo, id)
);
create index if not exists cobre_simulador_tipo_idx on public.cobre_simulador (tipo, creado_at);

alter table public.cobre_simulador enable row level security;
revoke all on public.cobre_simulador from anon, authenticated;

comment on table public.cobre_simulador is
  'Estado del simulador de Cobre (modo simulado). Solo Edge Functions con service role.';

select cron.unschedule(jobid) from cron.job where jobname = 'cobre-simulador';

select cron.schedule(
  'cobre-simulador',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://ovbozgezuboftcjwxlwj.supabase.co/functions/v1/cobre-simulador',
    headers := '{"content-type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
