-- Seguridad: cierra lo que quedó pendiente de la migración 1018.
--
-- 1) `_puede(recurso, accion)` ignoraba sus parámetros: cualquier usuario activo del backoffice
--    pasaba. Ahora pide el permiso real del rol (`rls_tiene_permiso`), igual que `exigir_permiso`.
--    La usan acreditar_lote, aplicar_liquidacion_lote, fn_acreditar_adelanto,
--    ajustar_saldo_subcuenta y ledger_conciliar_saldos.
-- 2) Auxiliares SECURITY DEFINER que cualquiera (incluso con la anon key) podía llamar y que
--    exponen datos de clientes, comisiones o el ledger. No las llama el frontend ni ninguna
--    política o vista: solo otras funciones SECURITY DEFINER (corren como su dueño) y las Edge
--    Functions con service role. Se les quita EXECUTE a anon y authenticated.

create or replace function public._puede(p_recurso text, p_accion text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public._llamada_confiable() or public.rls_tiene_permiso(p_recurso, p_accion);
$$;

revoke execute on function public._puede(text, text) from public, anon;
grant execute on function public._puede(text, text) to authenticated, service_role;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public._bloqueo_activo(uuid, uuid)',
    'public._comision_aplicable(uuid, uuid, text)',
    'public._es_transferencia_interna(uuid, text)',
    'public._estado_movimiento_id(text)',
    'public._ledger_sub_account_id(uuid, text)',
    'public.calcular_total_impuestos_lote(uuid)',
    'public.cliente_tiene_comision(uuid)',
    'public.cliente_tiene_movimientos(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- calcular_comision y calcular_comision_transferencia tienen varias firmas: se revocan todas.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('calcular_comision', 'calcular_comision_transferencia')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end $$;

-- _ledger_account_id lo usa _cobre_cuenta (SECURITY INVOKER): se mantiene para authenticated.
revoke execute on function public._ledger_account_id(text) from public, anon;
grant execute on function public._ledger_account_id(text) to authenticated, service_role;

-- leer_smvm la usa el admin (compliance): solo se le quita a anon.
revoke execute on function public.leer_smvm() from public, anon;
grant execute on function public.leer_smvm() to authenticated, service_role;
