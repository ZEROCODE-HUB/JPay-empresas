-- Tope de envíos de correo por destinatario (26/11/2026).
--
-- La recuperación de contraseña ahora puede salir por Resend (Edge Function
-- `recuperar-contrasena`), que es pública: necesita un tope para que nadie la use para llenar la
-- bandeja de otra persona ni para gastar la cuota de correo. `correo_reservar_envio` devuelve true
-- si pasó el intervalo desde el último envío con esa clave (misma idea que `reservar_tarea`).
-- La clave es un hash del correo: aquí no se guardan direcciones.
-- Aditiva.

create table if not exists public.correo_envios (
  clave text primary key check (length(clave) between 3 and 200),
  ultimo_at timestamptz not null default now()
);

comment on table public.correo_envios is
  'Último envío de correo por clave (tipo + hash del destinatario), para limitar reenvíos.';

alter table public.correo_envios enable row level security;
revoke all on public.correo_envios from anon, authenticated;

create or replace function public.correo_reservar_envio(p_clave text, p_intervalo interval)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ok boolean;
begin
  insert into public.correo_envios (clave, ultimo_at)
  values (p_clave, now())
  on conflict (clave) do update set ultimo_at = now()
  where public.correo_envios.ultimo_at < now() - p_intervalo
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.correo_reservar_envio(text, interval) from public, anon, authenticated;
grant execute on function public.correo_reservar_envio(text, interval) to service_role;
