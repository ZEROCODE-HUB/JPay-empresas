-- Solicitudes de activación desde el portal y correo saliente por Resend (26/11/2026).
--
-- Contexto: el cliente ya no conecta sus proveedores por su cuenta (ni ve sus nombres). En
-- Conexiones pide la activación con un formulario corto; la solicitud aparece en el admin
-- (Clientes → Solicitudes de contacto) y además se avisa por correo al buzón de soporte.
--
-- 1) `solicitudes_contacto`: servicios nuevos (`cobros_tarjeta`, `cuenta_spei`, `soporte`), el
--    comercio para el que se pide (clientes con varios comercios) y cuándo se avisó por correo.
-- 2) `correo_config`: remitente, buzón que recibe las solicitudes y la clave de Resend (en
--    Vault). Se administra desde el admin (Sistema → Integraciones → Correo); los secretos de
--    entorno `RESEND_API_KEY` / `RESEND_FROM` / `SOPORTE_EMAIL` siguen teniendo prioridad.
-- Aditiva: no borra datos ni columnas.

-- ── 1. Solicitudes ──────────────────────────────────────────────────────────
alter table public.solicitudes_contacto
  add column if not exists comercio_id uuid references public.comercios (id) on delete set null,
  add column if not exists notificada_at timestamptz;

alter table public.solicitudes_contacto
  drop constraint if exists solicitudes_contacto_servicio_check;
alter table public.solicitudes_contacto
  add constraint solicitudes_contacto_servicio_check
  check (servicio in ('domiciliacion', 'cobros_tarjeta', 'cuenta_spei', 'soporte'));

comment on column public.solicitudes_contacto.comercio_id is
  'Comercio del cliente para el que pide el servicio (null = su cuenta en general).';
comment on column public.solicitudes_contacto.notificada_at is
  'Último aviso por correo al buzón de soporte (lo marca la Edge Function solicitar-contacto).';

-- La función gana `p_comercio_id` (opcional). Se reemplaza la firma anterior: con dos firmas
-- PostgREST no sabría cuál elegir. Las llamadas viejas (5 parámetros con nombre) siguen sirviendo.
drop function if exists public.solicitar_contacto(text, text, text, text, text);

create or replace function public.solicitar_contacto(
  p_servicio text,
  p_nombre text,
  p_telefono text,
  p_correo text,
  p_mensaje text default null,
  p_comercio_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_legajo text := public.current_cliente_legajo();
  v_id uuid;
begin
  if v_legajo is null then
    raise exception 'Cliente no encontrado' using errcode = '42501';
  end if;
  if p_servicio is null
     or p_servicio not in ('domiciliacion', 'cobros_tarjeta', 'cuenta_spei', 'soporte') then
    raise exception 'Servicio inválido';
  end if;
  if p_comercio_id is not null and not exists (
    select 1 from public.comercios c where c.id = p_comercio_id and c.legajo = v_legajo
  ) then
    raise exception 'El comercio no pertenece a tu cuenta' using errcode = '42501';
  end if;

  -- Si ya tiene una abierta (nueva) del mismo servicio y comercio, se actualiza en vez de duplicar.
  select id into v_id from public.solicitudes_contacto
   where cliente_legajo = v_legajo and servicio = p_servicio and estado = 'nueva'
     and comercio_id is not distinct from p_comercio_id
   order by created_at desc limit 1
   for update;
  if v_id is not null then
    update public.solicitudes_contacto
       set nombre = btrim(p_nombre), telefono = btrim(p_telefono), correo = lower(btrim(p_correo)),
           mensaje = nullif(btrim(coalesce(p_mensaje, '')), ''), updated_at = now()
     where id = v_id;
    return v_id;
  end if;
  insert into public.solicitudes_contacto
    (cliente_legajo, servicio, comercio_id, nombre, telefono, correo, mensaje)
  values (v_legajo, p_servicio, p_comercio_id, btrim(p_nombre), btrim(p_telefono),
          lower(btrim(p_correo)), nullif(btrim(coalesce(p_mensaje, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.solicitar_contacto(text, text, text, text, text, uuid) from public, anon;
grant execute on function public.solicitar_contacto(text, text, text, text, text, uuid) to authenticated;

-- ── 2. Correo saliente (Resend) ─────────────────────────────────────────────
-- Una sola fila. Nadie la lee ni escribe directo desde el navegador: todo pasa por la Edge
-- Function `correo-config` (solo admins), que usa el service role.
create table if not exists public.correo_config (
  id boolean primary key default true check (id),
  remitente text check (remitente is null or length(remitente) between 3 and 200),
  destino_solicitudes text check (
    destino_solicitudes is null
    or (destino_solicitudes ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(destino_solicitudes) <= 160)
  ),
  clave_ref uuid,
  clave_pista text,
  admin_url text check (admin_url is null or (admin_url ~ '^https?://' and length(admin_url) <= 200)),
  probado_at timestamptz,
  probado_ok boolean,
  probado_detalle text check (probado_detalle is null or length(probado_detalle) <= 500),
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.correo_config is
  'Configuración del correo saliente (Resend): remitente, buzón de solicitudes y clave en Vault.';
comment on column public.correo_config.clave_ref is 'Id del secreto en Vault con la clave API de Resend.';
comment on column public.correo_config.clave_pista is 'Últimos 4 caracteres de la clave, para reconocerla en pantalla.';
comment on column public.correo_config.admin_url is
  'Dirección del panel admin (se guarda sola al configurar el correo desde el panel): para los enlaces de los avisos.';

insert into public.correo_config (id) values (true) on conflict (id) do nothing;

alter table public.correo_config enable row level security;
revoke all on public.correo_config from anon, authenticated;

-- Guarda remitente, buzón y/o clave. null = no cambia; cadena vacía = se borra (remitente/buzón).
create or replace function public.correo_guardar_config(
  p_remitente text,
  p_destino text,
  p_clave text,
  p_por text,
  p_admin_url text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ref uuid;
  v_clave text := nullif(btrim(coalesce(p_clave, '')), '');
begin
  insert into public.correo_config (id) values (true) on conflict (id) do nothing;
  update public.correo_config
     set remitente = case when p_remitente is null then remitente
                          else nullif(btrim(p_remitente), '') end,
         destino_solicitudes = case when p_destino is null then destino_solicitudes
                                    else nullif(lower(btrim(p_destino)), '') end,
         admin_url = coalesce(nullif(btrim(coalesce(p_admin_url, '')), ''), admin_url),
         updated_at = now(),
         updated_by = p_por
   where id;
  if v_clave is not null then
    select clave_ref into v_ref from public.correo_config where id;
    if v_ref is null or not exists (select 1 from vault.secrets where id = v_ref) then
      -- Por si quedó un secreto huérfano con el mismo nombre (el nombre es único en Vault).
      select s.id into v_ref from vault.secrets s where s.name = 'correo_resend_api_key';
    end if;
    if v_ref is not null then
      perform vault.update_secret(v_ref, v_clave);
    else
      v_ref := vault.create_secret(
        v_clave, 'correo_resend_api_key', 'Clave API de Resend (correo saliente)'
      );
    end if;
    update public.correo_config
       set clave_ref = v_ref, clave_pista = right(v_clave, 4),
           probado_at = null, probado_ok = null, probado_detalle = null
     where id;
  end if;
end;
$$;

create or replace function public.correo_quitar_clave(p_por text) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ref uuid;
begin
  select clave_ref into v_ref from public.correo_config where id;
  if v_ref is not null then
    delete from vault.secrets where id = v_ref;
  end if;
  update public.correo_config
     set clave_ref = null, clave_pista = null, probado_at = null, probado_ok = null,
         probado_detalle = null, updated_at = now(), updated_by = p_por
   where id;
end;
$$;

-- Configuración completa, con la clave descifrada: solo para las Edge Functions (service role).
create or replace function public.correo_leer_config() returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'remitente', c.remitente,
    'destino', c.destino_solicitudes,
    'pista', c.clave_pista,
    'admin_url', c.admin_url,
    'clave', (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = c.clave_ref),
    'probado_at', c.probado_at,
    'probado_ok', c.probado_ok,
    'probado_detalle', c.probado_detalle,
    'updated_at', c.updated_at,
    'updated_by', c.updated_by
  )
  from public.correo_config c
  where c.id;
$$;

create or replace function public.correo_registrar_prueba(p_ok boolean, p_detalle text)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.correo_config
     set probado_at = now(), probado_ok = p_ok, probado_detalle = left(p_detalle, 500)
   where id;
$$;

revoke all on function public.correo_guardar_config(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.correo_quitar_clave(text) from public, anon, authenticated;
revoke all on function public.correo_leer_config() from public, anon, authenticated;
revoke all on function public.correo_registrar_prueba(boolean, text) from public, anon, authenticated;
grant execute on function public.correo_guardar_config(text, text, text, text, text) to service_role;
grant execute on function public.correo_quitar_clave(text) to service_role;
grant execute on function public.correo_leer_config() to service_role;
grant execute on function public.correo_registrar_prueba(boolean, text) to service_role;
