-- Fase 3 de Ecart Pay: el comercio conecta su cuenta del proveedor por OAuth.
--
-- - `oauth_estados`: el `state` de cada intento de conexión (anti-CSRF, un solo uso, vence en
--   10 minutos). Solo lo tocan las Edge Functions con service role (RLS sin políticas).
-- - `comercio_proveedores`: se agregan `revocado_at` y `ultimo_error`.
-- - La clave privada del comercio (`private_id`) se guarda en Vault; `secreto_ref` apunta al
--   secreto. Las funciones `proveedor_*_secreto` son solo para el service role.
-- Aditiva.

create table if not exists public.oauth_estados (
  state uuid primary key default gen_random_uuid(),
  proveedor text not null references public.proveedores_pago (codigo) on update cascade,
  comercio_id uuid not null references public.comercios (id) on delete cascade,
  usuario_id uuid not null,
  entorno text not null check (entorno in ('sandbox', 'produccion')),
  volver_a text not null,
  creado_at timestamptz not null default now(),
  vence_at timestamptz not null default now() + interval '10 minutes',
  usado_at timestamptz
);

create index if not exists oauth_estados_vence_idx on public.oauth_estados (vence_at);

alter table public.oauth_estados enable row level security;
revoke all on public.oauth_estados from anon, authenticated;

comment on table public.oauth_estados is
  'State de OAuth por intento de conexión con un proveedor. Un solo uso; vence en 10 minutos.';

alter table public.comercio_proveedores
  add column if not exists revocado_at timestamptz,
  add column if not exists ultimo_error text;

-- Guarda (o reemplaza) la clave privada de la conexión en Vault y devuelve la referencia.
create or replace function public.proveedor_guardar_secreto(p_conexion_id uuid, p_secreto text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ref uuid;
begin
  select secreto_ref into v_ref from public.comercio_proveedores where id = p_conexion_id;
  if not found then
    raise exception 'Conexión % inexistente', p_conexion_id;
  end if;
  if v_ref is not null and exists (select 1 from vault.secrets where id = v_ref) then
    perform vault.update_secret(v_ref, p_secreto);
  else
    v_ref := vault.create_secret(
      p_secreto,
      'comercio_proveedor_' || p_conexion_id::text,
      'Clave privada del comercio en el proveedor de pagos'
    );
    update public.comercio_proveedores set secreto_ref = v_ref where id = p_conexion_id;
  end if;
  return v_ref;
end;
$$;

-- Clave privada en claro (para operar en nombre del comercio desde las Edge Functions).
create or replace function public.proveedor_leer_secreto(p_conexion_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select ds.decrypted_secret
  from public.comercio_proveedores cp
  join vault.decrypted_secrets ds on ds.id = cp.secreto_ref
  where cp.id = p_conexion_id;
$$;

-- Borra la clave privada de la conexión (al desconectar).
create or replace function public.proveedor_borrar_secreto(p_conexion_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ref uuid;
begin
  select secreto_ref into v_ref from public.comercio_proveedores where id = p_conexion_id;
  if v_ref is not null then
    delete from vault.secrets where id = v_ref;
    update public.comercio_proveedores set secreto_ref = null where id = p_conexion_id;
  end if;
end;
$$;

revoke execute on function
  public.proveedor_guardar_secreto(uuid, text),
  public.proveedor_leer_secreto(uuid),
  public.proveedor_borrar_secreto(uuid)
from public, anon, authenticated;
grant execute on function
  public.proveedor_guardar_secreto(uuid, text),
  public.proveedor_leer_secreto(uuid),
  public.proveedor_borrar_secreto(uuid)
to service_role;
