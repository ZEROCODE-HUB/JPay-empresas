-- Solicitudes de contacto desde el portal (10/11/2026): servicios que JPay atiende con un
-- ejecutivo en vez de activarse solos. El primero es Domiciliación: el comercio deja nombre,
-- teléfono y correo, y la solicitud aparece en el admin (Clientes → Solicitudes de contacto) para
-- que un ejecutivo lo llame. `servicio` deja la tabla lista para otros servicios.
-- Aditiva.

create table if not exists public.solicitudes_contacto (
  id uuid primary key default gen_random_uuid(),
  cliente_legajo text not null references public.clientes (legajo) on delete cascade,
  servicio text not null check (servicio in ('domiciliacion')),
  nombre text not null check (length(btrim(nombre)) between 2 and 120),
  telefono text not null check (length(btrim(telefono)) between 8 and 25),
  correo text not null check (correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(correo) <= 160),
  mensaje text check (mensaje is null or length(mensaje) <= 1000),
  estado text not null default 'nueva' check (estado in ('nueva', 'contactado', 'descartada')),
  nota text check (nota is null or length(nota) <= 1000),
  atendida_por text,
  atendida_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists solicitudes_contacto_estado_idx
  on public.solicitudes_contacto (estado, created_at desc);
create index if not exists solicitudes_contacto_cliente_idx
  on public.solicitudes_contacto (cliente_legajo, servicio, created_at desc);

-- RLS: el comercio ve las suyas y el backoffice todas. Las escrituras van solo por las funciones.
alter table public.solicitudes_contacto enable row level security;
revoke all on public.solicitudes_contacto from anon;
revoke insert, update, delete on public.solicitudes_contacto from authenticated;
grant select on public.solicitudes_contacto to authenticated;

drop policy if exists solicitudes_contacto_select on public.solicitudes_contacto;
create policy solicitudes_contacto_select on public.solicitudes_contacto for select to authenticated
  using (public.es_backoffice() or cliente_legajo = public.current_cliente_legajo());

-- El comercio de la sesión deja su solicitud. Si ya tiene una abierta (nueva) del mismo servicio,
-- se actualizan sus datos en vez de duplicarla.
create or replace function public.solicitar_contacto(
  p_servicio text,
  p_nombre text,
  p_telefono text,
  p_correo text,
  p_mensaje text default null
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
  select id into v_id from public.solicitudes_contacto
   where cliente_legajo = v_legajo and servicio = p_servicio and estado = 'nueva'
   order by created_at desc limit 1
   for update;
  if v_id is not null then
    update public.solicitudes_contacto
       set nombre = btrim(p_nombre), telefono = btrim(p_telefono), correo = lower(btrim(p_correo)),
           mensaje = nullif(btrim(coalesce(p_mensaje, '')), ''), updated_at = now()
     where id = v_id;
    return v_id;
  end if;
  insert into public.solicitudes_contacto (cliente_legajo, servicio, nombre, telefono, correo, mensaje)
  values (v_legajo, p_servicio, btrim(p_nombre), btrim(p_telefono), lower(btrim(p_correo)),
          nullif(btrim(coalesce(p_mensaje, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- El backoffice marca la solicitud como contactada o descartada, con una nota.
create or replace function public.atender_solicitud_contacto(
  p_id uuid,
  p_estado text,
  p_nota text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.es_backoffice() then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  if p_estado not in ('nueva', 'contactado', 'descartada') then
    raise exception 'Estado inválido: %', p_estado;
  end if;
  update public.solicitudes_contacto
     set estado = p_estado,
         nota = nullif(btrim(coalesce(p_nota, '')), ''),
         atendida_por = case when p_estado = 'nueva' then null else (select auth.jwt() ->> 'email') end,
         atendida_at = case when p_estado = 'nueva' then null else now() end,
         updated_at = now()
   where id = p_id;
  if not found then
    raise exception 'Solicitud inexistente';
  end if;
end;
$$;

revoke all on function public.solicitar_contacto(text, text, text, text, text) from public, anon;
grant execute on function public.solicitar_contacto(text, text, text, text, text) to authenticated;
revoke all on function public.atender_solicitud_contacto(uuid, text, text) from public, anon;
grant execute on function public.atender_solicitud_contacto(uuid, text, text) to authenticated;
