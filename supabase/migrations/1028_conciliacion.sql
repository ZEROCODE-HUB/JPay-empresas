-- Fase 8 de Ecart Pay: conciliación diaria contra las transacciones del proveedor.
--
-- `ecartpay-conciliacion` trae GET /api/transactions de cada comercio conectado y lo compara con
-- `pagos`. Las diferencias quedan en una bandeja para el backoffice. También guarda en cada pago
-- la comisión del proveedor y el neto (para reportes de comisiones). Aditiva.

alter table public.pagos
  add column if not exists comision_proveedor numeric(14, 2),
  add column if not exists neto_proveedor numeric(14, 2),
  add column if not exists proveedor_transaccion_id text,
  add column if not exists conciliado_at timestamptz;

create table if not exists public.conciliaciones_proveedor (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null references public.proveedores_pago (codigo) on update cascade,
  desde timestamptz not null,
  hasta timestamptz not null,
  origen text not null check (origen in ('programada', 'manual')),
  resumen jsonb not null default '{}'::jsonb,
  error text,
  ejecutada_at timestamptz not null default now()
);
create index if not exists conciliaciones_proveedor_ejecutada_idx
  on public.conciliaciones_proveedor (ejecutada_at desc);

create table if not exists public.conciliacion_proveedor_diferencias (
  id uuid primary key default gen_random_uuid(),
  conciliacion_id uuid not null references public.conciliaciones_proveedor (id) on delete cascade,
  conexion_id uuid references public.comercio_proveedores (id) on delete set null,
  tipo text not null check (
    tipo in ('falta_en_jpay', 'falta_en_proveedor', 'monto_distinto', 'estado_distinto')
  ),
  pago_id uuid references public.pagos (id) on delete set null,
  orden_id text,
  transaccion_id text,
  detalle jsonb not null default '{}'::jsonb,
  resuelta boolean not null default false,
  resuelta_at timestamptz,
  resuelta_por uuid,
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists conciliacion_proveedor_diferencias_abiertas_idx
  on public.conciliacion_proveedor_diferencias (resuelta, created_at desc);
-- La misma diferencia abierta no se repite en cada corrida.
create unique index if not exists conciliacion_proveedor_diferencias_abierta_key
  on public.conciliacion_proveedor_diferencias (tipo, coalesce(orden_id, ''), coalesce(pago_id::text, ''))
  where not resuelta;

alter table public.conciliaciones_proveedor enable row level security;
alter table public.conciliacion_proveedor_diferencias enable row level security;
revoke all on public.conciliaciones_proveedor, public.conciliacion_proveedor_diferencias from anon;
revoke insert, delete on public.conciliaciones_proveedor, public.conciliacion_proveedor_diferencias from authenticated;
revoke update on public.conciliaciones_proveedor from authenticated;
grant select on public.conciliaciones_proveedor, public.conciliacion_proveedor_diferencias to authenticated;
-- El backoffice puede marcar una diferencia como resuelta (solo esas columnas).
grant update (resuelta, resuelta_at, resuelta_por, nota) on public.conciliacion_proveedor_diferencias
  to authenticated;

drop policy if exists conciliaciones_proveedor_select on public.conciliaciones_proveedor;
create policy conciliaciones_proveedor_select on public.conciliaciones_proveedor
  for select to authenticated using (public.es_backoffice());
drop policy if exists conciliacion_proveedor_diferencias_select on public.conciliacion_proveedor_diferencias;
create policy conciliacion_proveedor_diferencias_select on public.conciliacion_proveedor_diferencias
  for select to authenticated using (public.es_backoffice());
drop policy if exists conciliacion_proveedor_diferencias_resolver on public.conciliacion_proveedor_diferencias;
create policy conciliacion_proveedor_diferencias_resolver on public.conciliacion_proveedor_diferencias
  for update to authenticated
  using (public.rls_tiene_permiso('movimientos', 'modificar'))
  with check (public.rls_tiene_permiso('movimientos', 'modificar'));

-- Todos los días a las 09:00 UTC (03:00 en CDMX). La función limita su propia frecuencia.
select cron.unschedule(jobid) from cron.job where jobname = 'ecartpay-conciliacion';
select cron.schedule(
  'ecartpay-conciliacion',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://ovbozgezuboftcjwxlwj.supabase.co/functions/v1/ecartpay-conciliacion',
    headers := '{"content-type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
