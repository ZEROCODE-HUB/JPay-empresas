-- ============================================================================
-- 1012_destinatarios_borradores_programadas.sql
-- Tablas para destinatarios frecuentes, borradores y programadas.
-- Todas usan legajo_de_sesion() / auth.email() para RLS por cliente.
-- La validación de destinatario NO se hace aquí: la hace recipient-validation
-- (mock ahora, COELSA futuro). Estas tablas solo persisten identificador
-- (CBU/CVU/Alias) y permiten reutilizarlo pasando de nuevo por validación.
-- ============================================================================

-- Destinatarios frecuentes: guarda CBU/CVU o Alias + titular cacheado
create table if not exists public.destinatarios_frecuentes (
  id uuid primary key default gen_random_uuid(),
  cliente_legajo text not null references public.clientes(legajo) on delete cascade,
  identifier text not null, -- CBU 22 dígitos, CVU 22 o Alias
  identifier_kind text not null check (identifier_kind in ('CBU','CVU','ALIAS')),
  alias text,
  cbu text,
  nombre text not null,
  cuit text,
  banco text,
  created_at timestamptz not null default now()
);
create index if not exists idx_destinatarios_cliente on public.destinatarios_frecuentes(cliente_legajo);

alter table public.destinatarios_frecuentes enable row level security;
drop policy if exists destinatarios_cliente on public.destinatarios_frecuentes;
create policy destinatarios_cliente on public.destinatarios_frecuentes
  for all to authenticated
  using (cliente_legajo = (select c.legajo from public.clientes c where c.correo = auth.email()))
  with check (cliente_legajo = (select c.legajo from public.clientes c where c.correo = auth.email()));

-- Borradores: no generan movimiento, se ejecutan vía Transfer → Validation → Movimiento
create table if not exists public.transferencias_borrador (
  id uuid primary key default gen_random_uuid(),
  cliente_legajo text not null references public.clientes(legajo) on delete cascade,
  subcuenta_origen uuid references public.subcuentas(id) on delete set null,
  destinatario_identifier text not null,
  destinatario_kind text not null,
  monto numeric(14,2) not null check (monto > 0),
  concepto text,
  created_at timestamptz not null default now()
);
create index if not exists idx_borrador_cliente on public.transferencias_borrador(cliente_legajo);
alter table public.transferencias_borrador enable row level security;
drop policy if exists borrador_cliente on public.transferencias_borrador;
create policy borrador_cliente on public.transferencias_borrador
  for all to authenticated
  using (cliente_legajo = (select c.legajo from public.clientes c where c.correo = auth.email()))
  with check (cliente_legajo = (select c.legajo from public.clientes c where c.correo = auth.email()));

-- Programadas: se ejecutan por cron/worker futuro, mismo flujo Validation → Movimiento
create table if not exists public.transferencias_programadas (
  id uuid primary key default gen_random_uuid(),
  cliente_legajo text not null references public.clientes(legajo) on delete cascade,
  subcuenta_origen uuid references public.subcuentas(id) on delete set null,
  destinatario_identifier text not null,
  destinatario_kind text not null,
  monto numeric(14,2) not null check (monto > 0),
  concepto text,
  fecha_envio date not null,
  hora_envio time not null,
  estado text not null default 'programada' check (estado in ('programada','ejecutada','cancelada','error')),
  created_at timestamptz not null default now()
);
create index if not exists idx_programada_cliente on public.transferencias_programadas(cliente_legajo);
alter table public.transferencias_programadas enable row level security;
drop policy if exists programada_cliente on public.transferencias_programadas;
create policy programada_cliente on public.transferencias_programadas
  for all to authenticated
  using (cliente_legajo = (select c.legajo from public.clientes c where c.correo = auth.email()))
  with check (cliente_legajo = (select c.legajo from public.clientes c where c.correo = auth.email()));
