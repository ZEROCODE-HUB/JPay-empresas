-- Código de confirmación de transferencias: verificación atómica (26/11/2026).
--
-- Antes la Edge Function leía el código, comparaba y después escribía `intentos + 1` o
-- `usado = true`: varias solicitudes en paralelo contaban como un solo intento (permitía forzar
-- el código de 6 dígitos) y dos envíos simultáneos podían usar el mismo código. Ahora todo pasa
-- en una sentencia con bloqueo de fila.
-- Devuelve 'ok' (código correcto, queda usado), 'incorrecto' (suma un intento) o 'vencido'
-- (no hay código vigente, venció o superó los 5 intentos).
-- Aditiva.

create or replace function public.otp_consumir(p_correo text, p_codigo text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_otp public.otp_transferencias;
begin
  select * into v_otp
    from public.otp_transferencias
   where correo = lower(btrim(p_correo)) and usado = false
   order by created_at desc
   limit 1
   for update;
  if not found then
    return 'vencido';
  end if;
  if v_otp.expires_at < now() or coalesce(v_otp.intentos, 0) >= 5 then
    update public.otp_transferencias set usado = true where id = v_otp.id;
    return 'vencido';
  end if;
  if v_otp.codigo is distinct from p_codigo then
    update public.otp_transferencias
       set intentos = coalesce(intentos, 0) + 1,
           usado = coalesce(intentos, 0) + 1 >= 5
     where id = v_otp.id;
    return 'incorrecto';
  end if;
  update public.otp_transferencias set usado = true where id = v_otp.id;
  return 'ok';
end;
$$;

revoke all on function public.otp_consumir(text, text) from public, anon, authenticated;
grant execute on function public.otp_consumir(text, text) to service_role;
