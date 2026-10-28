-- Seguridad: `eliminar_auth_por_email` (SECURITY DEFINER) borraba cualquier usuario de auth,
-- clientes y admin_users sin verificar quién llamaba, y la podía ejecutar `anon`.
-- Ahora exige un usuario activo del backoffice con el mismo criterio que la Edge Function
-- `eliminar-usuario`:
--   - destino del backoffice: `usuarios_backoffice: borrar` (y admin total si su rol es admin);
--   - cualquier otro (clientes): `usuarios: borrar`.

create or replace function public.eliminar_auth_por_email(p_email text)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_email text := lower(btrim(p_email));
begin
  if v_email is null or v_email = '' then
    raise exception 'email vacío';
  end if;

  if public.current_admin_id() is null then
    raise exception 'No tenés permiso para esta operación' using errcode = '42501';
  end if;

  if exists (select 1 from public.admin_users where lower(email) = v_email) then
    if not public.rls_tiene_permiso('usuarios_backoffice', 'borrar') then
      raise exception 'No tenés permiso para esta operación' using errcode = '42501';
    end if;
    if exists (
      select 1
      from public.admin_users au
      join public.roles r on r.id = au.rol_id
      where lower(au.email) = v_email and lower(r.nombre) = 'admin'
    ) and not public.is_admin() then
      raise exception 'Solo un administrador puede eliminar a otro administrador'
        using errcode = '42501';
    end if;
  elsif not public.rls_tiene_permiso('usuarios', 'borrar') then
    raise exception 'No tenés permiso para esta operación' using errcode = '42501';
  end if;

  delete from auth.users where lower(email) = v_email;
  -- También limpiar public por si el trigger no disparó (ej. borrado previo)
  delete from public.clientes where lower(correo) = v_email;
  delete from public.admin_users where lower(email) = v_email;
end;
$function$;

revoke execute on function public.eliminar_auth_por_email(text) from public, anon;
grant execute on function public.eliminar_auth_por_email(text) to authenticated;
