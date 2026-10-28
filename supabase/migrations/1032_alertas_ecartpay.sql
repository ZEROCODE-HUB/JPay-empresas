-- Fase 9 de Ecart Pay: monitoreo (checklist de salida a producción).
--
-- `alertas_proveedor_pagos`: lo que el backoffice tiene que mirar, calculado en el momento.
-- Cada alerta tiene `codigo`, `nivel` (critica | aviso), `cantidad` y `detalle`:
--   avisos_fallidos        avisos de las últimas 24 h rechazados (firma) o con error al procesar
--   tarea_pendientes       la revisión de pagos pendientes (cada 5 min) no corre hace > 15 min
--   conciliacion_atrasada  la conciliación diaria no corre hace > 26 h, o la última falló
--   diferencias_abiertas   diferencias de conciliación sin resolver
--   pendientes_viejos      pagos pendientes con la referencia vencida, o de hace más de 6 días
--   contracargos_por_vencer contracargos abiertos con plazo de pruebas en menos de 48 h
--   conexiones_con_error   comercios cuya conexión con el proveedor quedó en error
-- Solo backoffice. Aditiva.

create or replace function public.alertas_proveedor_pagos(p_proveedor text default 'ecartpay')
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v jsonb := '[]'::jsonb;
  n integer;
  t timestamptz;
  e text;
begin
  perform public.exigir_backoffice();

  select count(*) into n from public.webhook_eventos
  where proveedor = p_proveedor and recibido_at > now() - interval '24 hours'
    and (firma_valida is false or error is not null);
  if n > 0 then
    v := v || jsonb_build_object('codigo', 'avisos_fallidos', 'nivel', 'aviso', 'cantidad', n,
      'detalle', n || ' avisos rechazados o con error en las últimas 24 h');
  end if;

  select ultima_corrida_at into t from public.tareas_programadas
  where nombre = p_proveedor || '-pendientes';
  if t is null or t < now() - interval '15 minutes' then
    v := v || jsonb_build_object('codigo', 'tarea_pendientes', 'nivel', 'critica', 'cantidad', 1,
      'detalle', case when t is null then 'La revisión de pagos pendientes nunca corrió'
        else 'La revisión de pagos pendientes no corre desde ' || to_char(t, 'YYYY-MM-DD HH24:MI') || ' UTC' end);
  end if;

  select ejecutada_at, error into t, e from public.conciliaciones_proveedor
  where proveedor = p_proveedor order by ejecutada_at desc limit 1;
  if t is null or t < now() - interval '26 hours' or e is not null then
    v := v || jsonb_build_object('codigo', 'conciliacion_atrasada', 'nivel', 'critica', 'cantidad', 1,
      'detalle', case
        when t is null then 'La conciliación nunca corrió'
        when e is not null then 'La última conciliación falló: ' || e
        else 'La conciliación no corre desde ' || to_char(t, 'YYYY-MM-DD HH24:MI') || ' UTC' end);
  end if;

  select count(*) into n from public.conciliacion_proveedor_diferencias d
  join public.conciliaciones_proveedor c on c.id = d.conciliacion_id
  where c.proveedor = p_proveedor and not d.resuelta;
  if n > 0 then
    v := v || jsonb_build_object('codigo', 'diferencias_abiertas', 'nivel', 'critica', 'cantidad', n,
      'detalle', n || ' diferencias de conciliación sin resolver');
  end if;

  select count(*) into n from public.pagos
  where proveedor = p_proveedor and estado = 'pendiente'
    and (referencia_vence_at < now() or created_at < now() - interval '6 days');
  if n > 0 then
    v := v || jsonb_build_object('codigo', 'pendientes_viejos', 'nivel', 'aviso', 'cantidad', n,
      'detalle', n || ' pagos pendientes con la referencia vencida o de hace más de 6 días');
  end if;

  select count(*) into n from public.contracargos_proveedor
  where proveedor = p_proveedor and estado in ('created', 'pending')
    and vence_at < now() + interval '48 hours';
  if n > 0 then
    v := v || jsonb_build_object('codigo', 'contracargos_por_vencer', 'nivel', 'critica',
      'cantidad', n, 'detalle', n || ' contracargos abiertos con plazo de pruebas en menos de 48 h');
  end if;

  select count(*) into n from public.comercio_proveedores
  where proveedor = p_proveedor and estado = 'error';
  if n > 0 then
    v := v || jsonb_build_object('codigo', 'conexiones_con_error', 'nivel', 'aviso', 'cantidad', n,
      'detalle', n || ' comercios con la conexión en error');
  end if;

  return jsonb_build_object('generado_at', now(), 'alertas', v);
end;
$$;

revoke all on function public.alertas_proveedor_pagos(text) from public, anon;
grant execute on function public.alertas_proveedor_pagos(text) to authenticated;

comment on function public.alertas_proveedor_pagos(text) is
  'Alertas operativas de un proveedor de pagos (avisos, tareas, conciliación, pendientes, contracargos). Solo backoffice.';
