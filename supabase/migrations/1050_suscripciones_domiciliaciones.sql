-- Fase 5 y 6: suscripciones (cobro recurrente con tarjeta) y domiciliación (con CLABE), con la
-- cuenta de Ecart Pay del comercio (OAuth), igual que los enlaces de pago.
--
-- - proveedor_clientes: el "customer" que Ecart Pay exige para suscribir o domiciliar; uno por
--   comercio, proveedor y correo (se reusa).
-- - suscripciones: creadas con merchant_management (Ecart Pay devuelve un checkout_link que el
--   comercio comparte; el suscriptor agrega su tarjeta ahí y ahí se cobra).
-- - domiciliaciones: cargo fijo recurrente o único a la CLABE del cliente; Ecart Pay valida la
--   CLABE (CEP/STP) y, según la cuenta, la identidad; se activa cuando el cliente acepta.
-- - cobros_recurrentes: cada cobro (o intento fallido) de una suscripción o domiciliación,
--   registrado solo después de confirmarlo contra Ecart Pay (orden o suscripción).
-- Escrituras solo desde Edge Functions (service role); lectura: backoffice o el comercio dueño.
-- Aditiva.

create table if not exists public.proveedor_clientes (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios (id) on delete restrict,
  proveedor text not null default 'ecartpay' check (proveedor in ('ecartpay')),
  entorno text not null check (entorno in ('sandbox', 'produccion')),
  email text not null,
  nombre text not null,
  telefono text,
  cliente_externo_id text not null,
  created_at timestamptz not null default now(),
  unique (comercio_id, proveedor, entorno, email)
);

create table if not exists public.suscripciones (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios (id) on delete restrict,
  cliente_legajo text not null references public.clientes (legajo) on delete restrict,
  conexion_id uuid not null references public.comercio_proveedores (id) on delete restrict,
  entorno text not null check (entorno in ('sandbox', 'produccion')),
  proveedor_cliente_id uuid references public.proveedor_clientes (id) on delete restrict,
  suscriptor_nombre text not null,
  suscriptor_email text not null,
  servicio text not null check (length(servicio) between 1 and 120),
  beneficios text[] not null default '{}',
  monto numeric(14, 2) not null check (monto > 0),
  moneda text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  intervalo text not null check (intervalo in ('daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'yearly')),
  frecuencia int not null default 1 check (frecuencia between 1 and 12),
  dias_prueba int not null default 0 check (dias_prueba between 0 and 365),
  ciclo_dia int check (ciclo_dia between 1 and 31),
  ciclo_mes int check (ciclo_mes between 1 and 12),
  fecha_fin date,
  compromiso_periodos int check (compromiso_periodos between 1 and 120),
  -- `creando`: guardada antes de llamar (idempotencia); `error`: Ecart Pay la rechazó.
  estado text not null default 'creando'
    check (estado in ('creando', 'activa', 'pausada', 'cancelada', 'terminada', 'error')),
  id_externo text unique,
  checkout_link text,
  intentos int not null default 0,
  proximo_cobro timestamptz,
  ultimo_error text,
  respuesta jsonb,
  idempotency_key text not null unique,
  creado_por uuid,
  sincronizada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists suscripciones_comercio_idx on public.suscripciones (comercio_id, created_at desc);

create table if not exists public.domiciliaciones (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios (id) on delete restrict,
  cliente_legajo text not null references public.clientes (legajo) on delete restrict,
  conexion_id uuid not null references public.comercio_proveedores (id) on delete restrict,
  entorno text not null check (entorno in ('sandbox', 'produccion')),
  proveedor_cliente_id uuid references public.proveedor_clientes (id) on delete restrict,
  titular_nombre text not null,
  titular_email text not null,
  titular_rfc text,
  clabe text not null check (clabe ~ '^[0-9]{18}$'),
  alias text not null,
  concepto text not null check (length(concepto) between 1 and 120),
  monto numeric(14, 2) not null check (monto > 0),
  moneda text not null default 'MXN' check (moneda = 'MXN'),
  recurrente boolean not null default true,
  intervalo text check (intervalo in ('daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'yearly')),
  ciclo_dia int check (ciclo_dia between 1 and 31),
  fecha_fin date,
  -- Estados de Ecart Pay: created (espera aceptación/validación), active, pending (agotó
  -- reintentos), completed, cancelled; más los propios: creando, rechazada (validación), error.
  estado text not null default 'creando'
    check (estado in ('creando', 'created', 'active', 'pending', 'completed', 'cancelled', 'rechazada', 'error')),
  id_externo text unique,
  referencia text,
  nivel_validacion int,
  proximo_cobro timestamptz,
  ultimo_error text,
  respuesta jsonb,
  idempotency_key text not null unique,
  creado_por uuid,
  sincronizada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not recurrente or intervalo is not null)
);
create index if not exists domiciliaciones_comercio_idx on public.domiciliaciones (comercio_id, created_at desc);

create table if not exists public.cobros_recurrentes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('suscripcion', 'domiciliacion')),
  suscripcion_id uuid references public.suscripciones (id) on delete restrict,
  domiciliacion_id uuid references public.domiciliaciones (id) on delete restrict,
  comercio_id uuid not null references public.comercios (id) on delete restrict,
  cliente_legajo text not null,
  monto numeric(14, 2) not null,
  moneda text not null,
  estado text not null check (estado in ('pagado', 'fallido')),
  motivo text,
  -- Identificador del cobro en Ecart Pay (orden de la domiciliación, o suscripción + fecha).
  clave_externa text not null,
  orden_externa_id text,
  cobrado_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tipo, clave_externa),
  check ((tipo = 'suscripcion') = (suscripcion_id is not null)),
  check ((tipo = 'domiciliacion') = (domiciliacion_id is not null))
);
create index if not exists cobros_recurrentes_comercio_idx on public.cobros_recurrentes (comercio_id, cobrado_at desc);

-- RLS: lectura del backoffice o del comercio dueño; sin escrituras desde el cliente.
do $$
declare t text;
begin
  foreach t in array array['proveedor_clientes', 'suscripciones', 'domiciliaciones', 'cobros_recurrentes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists proveedor_clientes_select on public.proveedor_clientes;
create policy proveedor_clientes_select on public.proveedor_clientes for select to authenticated
  using (public.es_backoffice() or comercio_id in (
    select c.id from public.comercios c where c.legajo = public.current_cliente_legajo()));
drop policy if exists suscripciones_select on public.suscripciones;
create policy suscripciones_select on public.suscripciones for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());
drop policy if exists domiciliaciones_select on public.domiciliaciones;
create policy domiciliaciones_select on public.domiciliaciones for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());
drop policy if exists cobros_recurrentes_select on public.cobros_recurrentes;
create policy cobros_recurrentes_select on public.cobros_recurrentes for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());

-- Módulos de país: suscripciones y domiciliación (México sí; Argentina no).
update public.paises
   set modulos = modulos || jsonb_build_object('suscripciones', codigo = 'MX', 'domiciliacion', codigo = 'MX')
 where not (modulos ? 'suscripciones');

comment on table public.suscripciones is 'Suscripciones con tarjeta en la cuenta de Ecart Pay del comercio (merchant_management).';
comment on table public.domiciliaciones is 'Domiciliaciones (cargo a CLABE) en la cuenta de Ecart Pay del comercio.';
comment on table public.cobros_recurrentes is 'Cobros de suscripciones y domiciliaciones confirmados contra Ecart Pay.';
