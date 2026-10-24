-- ============================================================================
-- 1001_clientes_onboarding.sql  (el portal de empresas)
-- Extiende la tabla clientes (ya existente, el panel de administración) con los campos de
-- onboarding de persona física / jurídica + estado de alta. No crea tabla nueva:
-- los datos de detalle viven en clientes, enlazados por legajo.
-- ============================================================================

-- ---- Persona física ----
alter table public.clientes add column if not exists genero          text;
alter table public.clientes add column if not exists cuit_cuil       text;
alter table public.clientes add column if not exists fecha_nacimiento date;
alter table public.clientes add column if not exists ocupacion       text;
alter table public.clientes add column if not exists origen_fondos   text;
alter table public.clientes add column if not exists es_pep          boolean not null default false;

-- ---- Persona jurídica ----
alter table public.clientes add column if not exists tipo_sociedad   text;
alter table public.clientes add column if not exists nombre_legal    text;
alter table public.clientes add column if not exists nombre_fantasia text;
alter table public.clientes add column if not exists fecha_inscripcion date;

-- ---- Común (domicilio de residencia) ----
alter table public.clientes add column if not exists direccion       text;
alter table public.clientes add column if not exists direccion2      text;
alter table public.clientes add column if not exists ciudad          text;
alter table public.clientes add column if not exists provincia       text;
alter table public.clientes add column if not exists cp             text;

-- ---- Estado del alta (lo flipea el admin: pendiente -> aprobado / rechazado) ----
alter table public.clientes add column if not exists estado_onboarding text not null default 'pendiente';
alter table public.clientes
  add constraint clientes_estado_onboarding_check
  check (estado_onboarding in ('pendiente', 'aprobado', 'rechazado'));

create index if not exists idx_clientes_estado_onboarding
  on public.clientes (estado_onboarding);

-- ---- RLS: el cliente autenticado ve su propia fila (por correo) ----
drop policy if exists clientes_cliente_select on public.clientes;
create policy clientes_cliente_select on public.clientes
  for select to authenticated
  using (correo = auth.email());

-- ============================================================================
-- Storage: bucket privado para KYC (sube el edge function con service_role).
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('kyc', 'kyc', false)
on conflict (id) do nothing;

drop policy if exists kyc_select_authenticated on storage.objects;
create policy kyc_select_authenticated on storage.objects
  for select to authenticated
  using (bucket_id = 'kyc');
