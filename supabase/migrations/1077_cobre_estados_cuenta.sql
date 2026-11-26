-- Estados de cuenta mensuales de los Cobre Balances (Solution Design §7, `POST /reports` con
-- `resource: accounts`, `layout: cobre_balance_statements_v1`). 26/11/2026.
-- Una fila por cuenta y mes con el `repo_…` de Cobre (Cobre devuelve el mismo reporte si se pide
-- otra vez la misma cuenta y mes). El PDF no se guarda: se baja de Cobre en cada descarga.
-- La escribe solo `cobre-estados-cuenta` (service_role). Aditiva.

create table if not exists public.cobre_estados_cuenta (
  id uuid primary key default gen_random_uuid(),
  modo text not null check (modo in ('simulado', 'prueba', 'produccion')),
  cuenta_externa_id text not null,
  cliente_legajo text references public.clientes (legajo) on delete restrict,
  instancia_id uuid references public.cobre_instancias (id) on delete restrict,
  periodo text not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  reporte_id text,
  estado text not null default 'solicitado' check (estado in ('solicitado', 'listo', 'error')),
  motivo text,
  solicitado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (modo, cuenta_externa_id, periodo)
);

alter table public.cobre_estados_cuenta enable row level security;
revoke all on public.cobre_estados_cuenta from anon, authenticated;
grant select on public.cobre_estados_cuenta to authenticated;
drop policy if exists cobre_estados_cuenta_select on public.cobre_estados_cuenta;
create policy cobre_estados_cuenta_select on public.cobre_estados_cuenta for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());
