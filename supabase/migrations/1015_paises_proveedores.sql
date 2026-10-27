-- ============================================================================
-- 1015_paises_proveedores.sql
-- Fase 1 de la integración Ecart Pay (ver docs/PLAN_INTEGRACION_ECARTPAY.md):
-- plataforma neutral por país y por proveedor de pagos. Solo agrega tablas y
-- columnas; no cambia el comportamiento de lo existente.
--
--   paises                 catálogo de países (formato, moneda, zona horaria, módulos)
--   feriados               días no hábiles bancarios por país
--   proveedores_pago       catálogo de proveedores (ecartpay, payway, bdc…)
--   configuracion_pagos    valores por defecto por país/proveedor (modelo de fondos, comisión)
--   comercio_proveedores   conexión de cada comercio con su proveedor (+ overrides)
--   clientes.pais / tax_id / id_personal / regimen_fiscal / cuenta_bancaria
--   comercios.pais
--
-- Identificadores de cliente: `clientes.cuit` sigue siendo el identificador interno de 11
-- dígitos del que deriva el legajo (LPF/LPJ-<11 dígitos>). En Argentina es el CUIT; en
-- otros países es el número interno que asigna el registro (prefijo 99) y el identificador
-- fiscal real va en `tax_id` (RFC en México).
-- ============================================================================

-- ── Países ──────────────────────────────────────────────────────────────────
create table if not exists public.paises (
  codigo text primary key check (codigo ~ '^[A-Z]{2}$'),
  nombre text not null,
  locale text not null,
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  timezone text not null,
  prefijo_telefono text not null,
  tax_id_tipos text[] not null default '{}',
  cuenta_bancaria_tipo text not null,
  modulos jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  predeterminado boolean not null default false,
  updated_at timestamptz not null default now()
);
comment on table public.paises is
  'Países donde opera la plataforma. `predeterminado` = país de la instalación (uno solo).';
comment on column public.paises.modulos is
  'Funcionalidades activas por país, p. ej. {"spei":true,"oxxo":true,"iibb":false}.';

create unique index if not exists paises_un_predeterminado
  on public.paises (predeterminado) where predeterminado;

insert into public.paises
  (codigo, nombre, locale, moneda, timezone, prefijo_telefono, tax_id_tipos, cuenta_bancaria_tipo, modulos, activo, predeterminado)
values
  ('MX', 'México', 'es-MX', 'MXN', 'America/Mexico_City', '+52', '{RFC,CURP}', 'CLABE',
   '{"spei":true,"oxxo":true,"msi":true,"pos":true,"cfdi":false,"pld_mx":true,
     "iibb":false,"debitos_creditos":false,"bcra":false,"afip":false,"repet":false}'::jsonb,
   true, true),
  ('AR', 'Argentina', 'es-AR', 'ARS', 'America/Argentina/Buenos_Aires', '+54', '{CUIT,CUIL,DNI}', 'CBU',
   '{"spei":false,"oxxo":false,"msi":false,"pos":false,"cfdi":false,"pld_mx":false,
     "iibb":true,"debitos_creditos":true,"bcra":true,"afip":true,"repet":true}'::jsonb,
   false, false)
on conflict (codigo) do nothing;

-- ── Feriados ────────────────────────────────────────────────────────────────
create table if not exists public.feriados (
  pais text not null references public.paises (codigo) on update cascade,
  fecha date not null,
  descripcion text not null,
  primary key (pais, fecha)
);
comment on table public.feriados is 'Días no hábiles bancarios por país (sin contar sábados y domingos).';

-- Días inhábiles bancarios de México (calendario CNBV) 2026–2027.
insert into public.feriados (pais, fecha, descripcion) values
  ('MX', '2026-01-01', 'Año Nuevo'),
  ('MX', '2026-02-02', 'Día de la Constitución'),
  ('MX', '2026-03-16', 'Natalicio de Benito Juárez'),
  ('MX', '2026-04-02', 'Jueves Santo'),
  ('MX', '2026-04-03', 'Viernes Santo'),
  ('MX', '2026-05-01', 'Día del Trabajo'),
  ('MX', '2026-09-16', 'Día de la Independencia'),
  ('MX', '2026-11-02', 'Día de Muertos'),
  ('MX', '2026-11-16', 'Día de la Revolución'),
  ('MX', '2026-12-12', 'Día de la Virgen de Guadalupe'),
  ('MX', '2026-12-25', 'Navidad'),
  ('MX', '2027-01-01', 'Año Nuevo'),
  ('MX', '2027-02-01', 'Día de la Constitución'),
  ('MX', '2027-03-15', 'Natalicio de Benito Juárez'),
  ('MX', '2027-03-25', 'Jueves Santo'),
  ('MX', '2027-03-26', 'Viernes Santo'),
  ('MX', '2027-05-01', 'Día del Trabajo'),
  ('MX', '2027-09-16', 'Día de la Independencia'),
  ('MX', '2027-11-02', 'Día de Muertos'),
  ('MX', '2027-11-15', 'Día de la Revolución'),
  ('MX', '2027-12-12', 'Día de la Virgen de Guadalupe'),
  ('MX', '2027-12-25', 'Navidad')
on conflict do nothing;

create or replace function public.pais_predeterminado()
returns text
language sql stable
set search_path = public
as $$
  select coalesce((select codigo from paises where predeterminado limit 1), 'AR');
$$;

-- Días hábiles por país (excluye fines de semana y feriados del país). La versión de 2
-- parámetros que ya existe (sin feriados) no se toca: la usa el flujo argentino.
create or replace function public.sumar_dias_habiles(p_fecha date, p_dias integer, p_pais text)
returns date
language plpgsql stable
set search_path = public
as $$
declare
  v_result date := p_fecha;
  v_count integer := 0;
begin
  while v_count < p_dias loop
    v_result := v_result + 1;
    if extract(dow from v_result) not in (0, 6)
       and not exists (select 1 from feriados f where f.pais = p_pais and f.fecha = v_result) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_result;
end;
$$;

-- ── Proveedores de pago ─────────────────────────────────────────────────────
create table if not exists public.proveedores_pago (
  codigo text primary key check (codigo ~ '^[a-z0-9_]+$'),
  nombre text not null,
  pais text not null references public.paises (codigo) on update cascade,
  tipos text[] not null default '{}',
  activo boolean not null default true,
  sandbox boolean not null default true,
  updated_at timestamptz not null default now()
);
comment on column public.proveedores_pago.tipos is
  'Medios que cubre: tarjeta, transferencia, efectivo, pos, wallet.';
comment on column public.proveedores_pago.sandbox is
  'true = se usa el entorno de pruebas del proveedor.';

insert into public.proveedores_pago (codigo, nombre, pais, tipos, activo, sandbox) values
  ('ecartpay', 'Ecart Pay', 'MX', '{tarjeta,transferencia,efectivo,pos,wallet}', true, true),
  ('payway', 'Payway', 'AR', '{tarjeta}', false, false),
  ('bdc', 'Banco de Comercio (Coelsa)', 'AR', '{transferencia}', false, false)
on conflict (codigo) do nothing;

-- ── Configuración de pagos por país/proveedor (defaults) ────────────────────
create table if not exists public.configuracion_pagos (
  pais text not null references public.paises (codigo) on update cascade,
  proveedor text not null references public.proveedores_pago (codigo) on update cascade,
  modelo_fondos text not null default 'directo'
    check (modelo_fondos in ('directo', 'centralizado')),
  cobro_comision text not null default 'cobro_aparte'
    check (cobro_comision in ('split_proveedor', 'descuento_liquidacion', 'cobro_aparte')),
  comision_pct numeric(7, 4) not null default 0 check (comision_pct >= 0 and comision_pct < 100),
  comision_fija numeric(14, 2) not null default 0 check (comision_fija >= 0),
  iva_comision_pct numeric(5, 2) not null default 0 check (iva_comision_pct >= 0 and iva_comision_pct < 100),
  updated_at timestamptz not null default now(),
  primary key (pais, proveedor),
  -- El descuento antes de liquidar solo existe si JPay recibe el dinero.
  constraint configuracion_pagos_cobro_valido
    check (cobro_comision <> 'descuento_liquidacion' or modelo_fondos = 'centralizado')
);
comment on column public.configuracion_pagos.modelo_fondos is
  'directo = cada comercio cobra en su cuenta del proveedor (OAuth); centralizado = cobra JPay y liquida al comercio.';
comment on column public.configuracion_pagos.cobro_comision is
  'split_proveedor = la separa el proveedor (acuerdo aparte); descuento_liquidacion = se descuenta antes de liquidar (solo centralizado); cobro_aparte = se acumula y se cobra después.';

insert into public.configuracion_pagos (pais, proveedor, modelo_fondos, cobro_comision, iva_comision_pct)
values ('MX', 'ecartpay', 'directo', 'cobro_aparte', 16)
on conflict do nothing;

-- ── Conexión de cada comercio con su proveedor ──────────────────────────────
create table if not exists public.comercio_proveedores (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios (id) on delete cascade,
  proveedor text not null references public.proveedores_pago (codigo) on update cascade,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'conectado', 'revocado', 'error')),
  entorno text not null default 'sandbox' check (entorno in ('sandbox', 'produccion')),
  cuenta_externa_id text,
  public_id text,
  -- Referencia al secreto en Supabase Vault; nunca el secreto en texto plano.
  secreto_ref uuid,
  scopes text[] not null default '{}',
  conectado_at timestamptz,
  -- Overrides de configuracion_pagos (null = usar el default del país/proveedor).
  modelo_fondos text check (modelo_fondos in ('directo', 'centralizado')),
  cobro_comision text
    check (cobro_comision in ('split_proveedor', 'descuento_liquidacion', 'cobro_aparte')),
  comision_pct numeric(7, 4) check (comision_pct >= 0 and comision_pct < 100),
  comision_fija numeric(14, 2) check (comision_fija >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comercio_id, proveedor, entorno)
);
create index if not exists comercio_proveedores_proveedor_idx
  on public.comercio_proveedores (proveedor, estado);

-- ── Columnas por país en clientes y comercios ───────────────────────────────
alter table public.clientes
  add column if not exists pais text references public.paises (codigo) on update cascade,
  add column if not exists tax_id text,
  add column if not exists tax_id_tipo text,
  add column if not exists id_personal text,
  add column if not exists id_personal_tipo text,
  add column if not exists regimen_fiscal text,
  add column if not exists cuenta_bancaria text,
  add column if not exists cuenta_bancaria_tipo text;

alter table public.comercios
  add column if not exists pais text references public.paises (codigo) on update cascade;

-- Lo que ya existe es argentino; lo nuevo toma el país de la instalación.
update public.clientes set pais = 'AR' where pais is null;
update public.comercios set pais = 'AR' where pais is null;
update public.clientes set tax_id = cuit, tax_id_tipo = 'CUIT'
  where pais = 'AR' and tax_id is null and cuit !~ '^99';

alter table public.clientes alter column pais set default public.pais_predeterminado();
alter table public.clientes alter column pais set not null;
alter table public.comercios alter column pais set default public.pais_predeterminado();
alter table public.comercios alter column pais set not null;

comment on column public.clientes.cuit is
  'Identificador interno de 11 dígitos (deriva el legajo). AR: CUIT. Otros países: número interno con prefijo 99; el fiscal va en tax_id.';
comment on column public.clientes.tax_id is 'Identificador fiscal del país (CUIT, RFC…), sin guiones.';
comment on column public.clientes.id_personal is 'Identificador personal (CURP, DNI…) de la persona física.';
comment on column public.clientes.cuenta_bancaria is 'Cuenta para liquidaciones (CLABE, CBU…).';

create unique index if not exists clientes_pais_tax_id_key
  on public.clientes (pais, tax_id) where tax_id is not null;

-- ── updated_at ──────────────────────────────────────────────────────────────
drop trigger if exists paises_set_updated_at on public.paises;
create trigger paises_set_updated_at before update on public.paises
  for each row execute function public.set_updated_at();
drop trigger if exists proveedores_pago_set_updated_at on public.proveedores_pago;
create trigger proveedores_pago_set_updated_at before update on public.proveedores_pago
  for each row execute function public.set_updated_at();
drop trigger if exists configuracion_pagos_set_updated_at on public.configuracion_pagos;
create trigger configuracion_pagos_set_updated_at before update on public.configuracion_pagos
  for each row execute function public.set_updated_at();
drop trigger if exists comercio_proveedores_set_updated_at on public.comercio_proveedores;
create trigger comercio_proveedores_set_updated_at before update on public.comercio_proveedores
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.paises enable row level security;
alter table public.feriados enable row level security;
alter table public.proveedores_pago enable row level security;
alter table public.configuracion_pagos enable row level security;
alter table public.comercio_proveedores enable row level security;

-- Catálogos: lectura pública (el registro los usa antes de iniciar sesión); edición solo admin.
drop policy if exists paises_select on public.paises;
create policy paises_select on public.paises for select to anon, authenticated using (true);
drop policy if exists paises_admin on public.paises;
create policy paises_admin on public.paises for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists feriados_select on public.feriados;
create policy feriados_select on public.feriados for select to anon, authenticated using (true);
drop policy if exists feriados_admin on public.feriados;
create policy feriados_admin on public.feriados for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists proveedores_pago_select on public.proveedores_pago;
create policy proveedores_pago_select on public.proveedores_pago for select to authenticated using (true);
drop policy if exists proveedores_pago_admin on public.proveedores_pago;
create policy proveedores_pago_admin on public.proveedores_pago for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists configuracion_pagos_select on public.configuracion_pagos;
create policy configuracion_pagos_select on public.configuracion_pagos for select to authenticated using (true);
drop policy if exists configuracion_pagos_admin on public.configuracion_pagos;
create policy configuracion_pagos_admin on public.configuracion_pagos for all to authenticated
  using (is_admin()) with check (is_admin());

-- Conexiones: el comercio ve las suyas; solo admin (o Edge Functions con service role) escribe.
drop policy if exists comercio_proveedores_select on public.comercio_proveedores;
create policy comercio_proveedores_select on public.comercio_proveedores for select to authenticated
  using (
    is_admin()
    or comercio_id in (select c.id from comercios c where c.legajo = current_cliente_legajo())
  );
drop policy if exists comercio_proveedores_admin on public.comercio_proveedores;
create policy comercio_proveedores_admin on public.comercio_proveedores for all to authenticated
  using (is_admin()) with check (is_admin());
