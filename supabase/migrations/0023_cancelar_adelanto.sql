-- ============================================================================
-- 0023_cancelar_adelanto.sql  (el portal de empresas)
-- RPC para que el comercio cancele sus propios adelantos (Pendiente / Aprobado).
-- RLS UPDATE se maneja vía SECURITY DEFINER + validación de comercio_id.
-- ============================================================================

-- ---- RPC cancelar_adelanto: solo permite cancelar si el adelanto es del
--      comercio autenticado y está en estado Pendiente o Aprobado.
create or replace function public.cancelar_adelanto(
  p_adelanto_id uuid
)
returns public.adelantos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comercio_id uuid := public.usuario_comercio_id();
  v_row         public.adelantos;
begin
  if v_comercio_id is null then
    raise exception 'No se pudo identificar el comercio del usuario.';
  end if;

  select * into v_row
  from public.adelantos a
  where a.id = p_adelanto_id
    and a.comercio_id = v_comercio_id;

  if not found then
    raise exception 'El adelanto no existe o no pertenece a tu comercio.';
  end if;

  if v_row.estado not in ('Pendiente', 'Aprobado') then
    raise exception 'Solo se pueden cancelar adelantos en estado Pendiente o Aprobado. Estado actual: %', v_row.estado;
  end if;

  update public.adelantos
  set estado = 'Cancelado'
  where id = p_adelanto_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.cancelar_adelanto(uuid) to authenticated;
grant execute on function public.cancelar_adelanto(uuid) to service_role;
