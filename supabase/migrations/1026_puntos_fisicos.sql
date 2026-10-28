-- Fase 7 de Ecart Pay: puntos físicos (plan 3.2 punto 8). Estructura del proveedor:
-- Sucursal → Caja → Terminal (una terminal por caja).
--
-- Cada fila guarda el id del proveedor (`id_externo`). Las escribe solo la Edge Function
-- `ecartpay-pos` (crea primero en Ecart Pay y después acá, o sincroniza lo creado en su panel);
-- el comercio y el backoffice las leen por RLS. Las bajas son lógicas (`eliminado_at`), igual
-- que en Ecart Pay (que permite restaurar). Aditiva; no toca `puntos_venta` (QR).

create table if not exists public.sucursales (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios (id) on delete cascade,
  proveedor text not null default 'ecartpay' references public.proveedores_pago (codigo)
    on update cascade,
  id_externo text,
  nombre text not null check (length(nombre) between 1 and 100),
  calle text,
  ciudad text,
  estado_region text,
  codigo_postal text,
  telefono text,
  email text,
  encargado text,
  horario jsonb not null default '{}'::jsonb,
  timezone text not null default 'America/Mexico_City',
  estado text not null default 'activa' check (estado in ('activa', 'inactiva', 'pausada')),
  sincronizado_at timestamptz,
  eliminado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proveedor, id_externo)
);
create index if not exists sucursales_comercio_idx on public.sucursales (comercio_id);

create table if not exists public.terminales (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios (id) on delete cascade,
  proveedor text not null default 'ecartpay' references public.proveedores_pago (codigo)
    on update cascade,
  id_externo text not null,
  serie text,
  tipo text not null default 'terminal' check (tipo in ('terminal', 'kiosco', 'tap_to_phone')),
  modo text,
  es_punto_venta boolean not null default false,
  estado text,
  sincronizado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proveedor, id_externo)
);
create index if not exists terminales_comercio_idx on public.terminales (comercio_id);

create table if not exists public.cajas (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references public.sucursales (id) on delete cascade,
  id_externo text,
  nombre text not null check (length(nombre) between 1 and 100),
  numero text not null check (length(numero) between 1 and 50),
  estado text not null default 'activa' check (estado in ('activa', 'inactiva', 'mantenimiento')),
  terminal_id uuid unique references public.terminales (id) on delete set null,
  permite_reembolsos boolean not null default false,
  tope_reembolso numeric(14, 2) check (tope_reembolso is null or tope_reembolso >= 0),
  requiere_aprobacion boolean not null default false,
  umbral_aprobacion numeric(14, 2) check (umbral_aprobacion is null or umbral_aprobacion >= 0),
  copias_ticket integer not null default 1 check (copias_ticket between 1 and 5),
  sincronizado_at timestamptz,
  eliminado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id_externo)
);
create index if not exists cajas_sucursal_idx on public.cajas (sucursal_id);
-- El número de caja es único dentro de la sucursal (entre las no eliminadas), como en Ecart Pay.
create unique index if not exists cajas_numero_key
  on public.cajas (sucursal_id, numero) where eliminado_at is null;

-- RLS: lectura del comercio dueño y del backoffice; escritura solo service role.
alter table public.sucursales enable row level security;
alter table public.cajas enable row level security;
alter table public.terminales enable row level security;
revoke all on public.sucursales, public.cajas, public.terminales from anon;
revoke insert, update, delete on public.sucursales, public.cajas, public.terminales
  from authenticated;
grant select on public.sucursales, public.cajas, public.terminales to authenticated;

drop policy if exists sucursales_select on public.sucursales;
create policy sucursales_select on public.sucursales for select to authenticated using (
  public.es_backoffice()
  or comercio_id in (
    select c.id from public.comercios c where c.legajo = public.current_cliente_legajo()
  )
);

drop policy if exists terminales_select on public.terminales;
create policy terminales_select on public.terminales for select to authenticated using (
  public.es_backoffice()
  or comercio_id in (
    select c.id from public.comercios c where c.legajo = public.current_cliente_legajo()
  )
);

drop policy if exists cajas_select on public.cajas;
create policy cajas_select on public.cajas for select to authenticated using (
  public.es_backoffice()
  or sucursal_id in (
    select s.id from public.sucursales s
    join public.comercios c on c.id = s.comercio_id
    where c.legajo = public.current_cliente_legajo()
  )
);

comment on table public.sucursales is 'Sucursales del comercio (Ecart Pay: pos/branches).';
comment on table public.cajas is 'Cajas de cada sucursal (Ecart Pay: pos/sales-registers).';
comment on table public.terminales is 'Terminales del comercio (Ecart Pay: pos_information).';
