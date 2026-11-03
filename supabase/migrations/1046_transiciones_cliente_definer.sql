-- El trigger que registra los cambios de estado del cliente (`fn_log_transicion_cliente`) corría
-- con los permisos de quien actualiza: `cliente_transiciones` no tiene política de INSERT, así que
-- aprobar un cliente desde el admin fallaba con "new row violates row-level security policy".
-- Pasa a SECURITY DEFINER (el registro de auditoría lo escribe el sistema, no el usuario).
alter function public.fn_log_transicion_cliente() security definer;
alter function public.fn_log_transicion_cliente() set search_path to public;
revoke all on function public.fn_log_transicion_cliente() from public, anon, authenticated;
