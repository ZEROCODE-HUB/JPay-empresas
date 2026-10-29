-- Países: cambios atómicos desde el admin (revisión de código, 2026-10-29).
--
-- - `pais_cambiar_modulo`: prende o apaga un módulo con jsonb_set sobre el valor guardado (antes
--   el admin mandaba el objeto entero armado con lo que tenía en pantalla y dos clics seguidos se
--   pisaban).
-- - `pais_predeterminar`: desmarca el actual y marca el nuevo en una sola transacción (antes eran
--   dos updates y, si fallaba el segundo, quedaba la instalación sin país).
-- Solo administradores (mismo criterio que la política `paises_admin`).
-- Aditiva.

create or replace function public.pais_cambiar_modulo(p_codigo text, p_modulo text, p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_modulos jsonb;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar los módulos de un país' using errcode = '42501';
  end if;
  if p_modulo !~ '^[a-z_]{2,40}$' then
    raise exception 'Módulo inválido: %', p_modulo;
  end if;
  update public.paises
     set modulos = jsonb_set(coalesce(modulos, '{}'::jsonb), array[p_modulo], to_jsonb(p_activo))
   where codigo = p_codigo
  returning modulos into v_modulos;
  if not found then
    raise exception 'País inexistente: %', p_codigo;
  end if;
  return v_modulos;
end;
$$;

create or replace function public.pais_predeterminar(p_codigo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar el país de la instalación' using errcode = '42501';
  end if;
  if not exists (select 1 from public.paises where codigo = p_codigo) then
    raise exception 'País inexistente: %', p_codigo;
  end if;
  update public.paises set predeterminado = false where predeterminado and codigo <> p_codigo;
  update public.paises set predeterminado = true, activo = true where codigo = p_codigo;
end;
$$;

revoke all on function public.pais_cambiar_modulo(text, text, boolean) from public, anon;
revoke all on function public.pais_predeterminar(text) from public, anon;
grant execute on function public.pais_cambiar_modulo(text, text, boolean) to authenticated;
grant execute on function public.pais_predeterminar(text) to authenticated;

-- ── Alta de usuarios del backoffice sin escalada de privilegios ─────────────
-- `crear-admin` lo puede usar quien tiene `usuarios_backoffice: crear`. Un admin total asigna
-- cualquier rol; los demás solo roles cuyos permisos ya tienen (cada recurso y acción del rol
-- elegido tiene que estar también en el rol de quien crea). Antes solo se bloqueaba el rol
-- llamado "admin".
create or replace function public.rol_asignable(p_rol_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_mio uuid;
begin
  if public.is_admin() then
    return true;
  end if;
  if exists (select 1 from public.roles where id = p_rol_id and lower(nombre) = 'admin') then
    return false;
  end if;
  select rol_id into v_mio from public.admin_users where id = auth.uid() and activo limit 1;
  if v_mio is null then
    return false;
  end if;
  return not exists (
    select 1
      from public.permisos o
      left join public.permisos m on m.rol_id = v_mio and m.recurso_id = o.recurso_id
     where o.rol_id = p_rol_id
       and (   (o.puede_leer and not coalesce(m.puede_leer, false))
            or (o.puede_crear and not coalesce(m.puede_crear, false))
            or (o.puede_modificar and not coalesce(m.puede_modificar, false))
            or (o.puede_borrar and not coalesce(m.puede_borrar, false)))
  );
end;
$$;
revoke all on function public.rol_asignable(uuid) from public, anon;
grant execute on function public.rol_asignable(uuid) to authenticated;
