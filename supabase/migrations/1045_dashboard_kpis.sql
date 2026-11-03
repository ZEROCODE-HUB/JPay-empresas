-- Indicadores del inicio del admin (antes mostraban "Sin datos").
--
-- `dashboard_kpis()` (solo backoffice) devuelve en una consulta:
-- - clientes activos (estado activado/activo) sobre el total de clientes no eliminados;
-- - volumen del día: transacciones contabilizadas (ledger `posted`) en la moneda del país de la
--   instalación, contando el día en su zona horaria;
-- - alertas pendientes (pending + in_review) y cuántas ya vencieron su plazo;
-- - altas en revisión: clientes registrados o preactivados (esperan revisión del backoffice) y
--   cuántos todavía no verificaron el correo.
-- Aditiva.

create or replace function public.dashboard_kpis()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_moneda text;
  v_tz text;
  v_desde timestamptz;
  r jsonb;
begin
  if not public.es_backoffice() then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;

  select moneda, timezone into v_moneda, v_tz from public.paises where predeterminado limit 1;
  v_moneda := coalesce(v_moneda, 'MXN');
  v_tz := coalesce(v_tz, 'America/Mexico_City');
  v_desde := date_trunc('day', now() at time zone v_tz) at time zone v_tz;

  select jsonb_build_object(
    'clientes_activos', (select count(*) from public.clientes where estado in ('activado', 'activo')),
    'clientes_total', (select count(*) from public.clientes where estado <> 'eliminado'),
    'volumen_dia', (select coalesce(sum(t.monto_operacion), 0) from public.transactions t
                     where t.ledger_status = 'posted' and t.currency_code = v_moneda
                       and coalesce(t.fecha, t.created_at) >= v_desde),
    'operaciones_dia', (select count(*) from public.transactions t
                         where t.ledger_status = 'posted' and t.currency_code = v_moneda
                           and coalesce(t.fecha, t.created_at) >= v_desde),
    'moneda', v_moneda,
    'alertas_pendientes', (select count(*) from public.alerts where status in ('pending', 'in_review')),
    'alertas_vencidas', (select count(*) from public.alerts
                          where status in ('pending', 'in_review') and due_at < now()),
    'altas_revision', (select count(*) from public.clientes where estado in ('registrado', 'preactivado')),
    'altas_sin_email', (select count(*) from public.clientes where estado = 'pendiente_verificacion')
  ) into r;
  return r;
end;
$$;

revoke all on function public.dashboard_kpis() from public, anon;
grant execute on function public.dashboard_kpis() to authenticated;
