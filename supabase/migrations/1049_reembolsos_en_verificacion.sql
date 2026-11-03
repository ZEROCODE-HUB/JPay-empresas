-- Reembolsos "en verificación" (Ecart Pay no respondió claro y no se sabe si se hizo).
--
-- - `alertas_proveedor_pagos` avisa de los que siguen `solicitado` hace más de 30 minutos.
-- - `reembolsos_en_verificacion()` los lista para el backoffice.
-- - `resolver_reembolso(p_id, p_ok, p_nota)`: el backoffice, después de mirar el panel de Ecart
--   Pay, lo da por hecho (descuenta del pago) o por no hecho (libera el disponible). Solo para
--   reembolsos todavía `solicitado`; queda la nota y quién lo resolvió.
-- Aditiva.

CREATE OR REPLACE FUNCTION public.alertas_proveedor_pagos(p_proveedor text DEFAULT 'ecartpay'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  select count(*) into n from public.reembolsos
  where proveedor = p_proveedor and estado = 'solicitado' and created_at < now() - interval '30 minutes';
  if n > 0 then
    v := v || jsonb_build_object('codigo', 'reembolsos_en_verificacion', 'nivel', 'critica', 'cantidad', n,
      'detalle', n || ' reembolsos sin respuesta clara del proveedor: revisarlos en su panel y resolverlos');
  end if;

  select count(*) into n from public.comercio_proveedores
  where proveedor = p_proveedor and estado = 'error';
  if n > 0 then
    v := v || jsonb_build_object('codigo', 'conexiones_con_error', 'nivel', 'aviso', 'cantidad', n,
      'detalle', n || ' comercios con la conexión en error');
  end if;

  -- Cobre: transferencias trabadas, aprobaciones esperando y depósitos sin dueño.
  if p_proveedor = 'cobre' then
    select count(*) into n from public.cobre_transferencias
    where estado in ('enviando', 'pendiente') and updated_at < now() - interval '1 hour';
    if n > 0 then
      v := v || jsonb_build_object('codigo', 'transferencias_trabadas', 'nivel', 'critica', 'cantidad', n,
        'detalle', n || ' transferencias SPEI sin resultado hace más de 1 hora');
    end if;
    select count(*) into n from public.cobre_transferencias
    where estado = 'pendiente_aprobacion' and created_at < now() - interval '24 hours';
    if n > 0 then
      v := v || jsonb_build_object('codigo', 'aprobaciones_esperando', 'nivel', 'aviso', 'cantidad', n,
        'detalle', n || ' transferencias esperan aprobación hace más de 24 h');
    end if;
    select count(*) into n from public.cobre_depositos
    where estado = 'sin_asignar' and devolucion_estado is distinct from 'completada';
    if n > 0 then
      v := v || jsonb_build_object('codigo', 'depositos_sin_asignar', 'nivel', 'aviso', 'cantidad', n,
        'detalle', n || ' depósitos llegaron a una CLABE sin dueño (devolver o asignar)');
    end if;
    select count(*) into n from public.cobre_transferencias
    where estado = 'trasladando' and updated_at < now() - interval '2 hours';
    if n > 0 then
      v := v || jsonb_build_object('codigo', 'envios_usd_trabados', 'nivel', 'critica', 'cantidad', n,
        'detalle', n || ' envíos en dólares con el traslado al Balance USA sin terminar hace más de 2 h');
    end if;
    select count(*) into n from public.cobre_cruces
    where estado in ('enviando', 'initiated', 'processing') and updated_at < now() - interval '1 hour';
    if n > 0 then
      v := v || jsonb_build_object('codigo', 'conversiones_trabadas', 'nivel', 'critica', 'cantidad', n,
        'detalle', n || ' conversiones a dólares sin resultado hace más de 1 hora');
    end if;
    select count(*) into n from public.cobre_subclientes
    where estado in ('enviando', 'processing') and updated_at < now() - interval '48 hours';
    if n > 0 then
      v := v || jsonb_build_object('codigo', 'altas_trabadas', 'nivel', 'aviso', 'cantidad', n,
        'detalle', n || ' altas de comercios en Cobre siguen en revisión hace más de 48 h');
    end if;
    select count(*) into n from public.cobre_subclientes where revocado_at is not null and not revocado_revisado;
    if n > 0 then
      v := v || jsonb_build_object('codigo', 'altas_revocadas', 'nivel', 'critica', 'cantidad', n,
        'detalle', n || ' comercios aprobados que Cobre rechazó después por cumplimiento (consultar al KAM)');
    end if;
    select count(*) into n from public.cobre_cuentas
    where estado = 'activa' and conectividad is not null and conectividad <> 'connected';
    if n > 0 then
      v := v || jsonb_build_object('codigo', 'balances_desconectados', 'nivel', 'critica', 'cantidad', n,
        'detalle', n || ' Balances de Cobre activos sin conexión con el proveedor');
    end if;
    select count(*) into n from public.cobre_contrapartes
    where tipo = 'business' and verificacion = 'procesando' and created_at < now() - interval '24 hours';
    if n > 0 then
      v := v || jsonb_build_object('codigo', 'destinatarios_usd_sin_verificar', 'nivel', 'aviso', 'cantidad', n,
        'detalle', n || ' destinatarios en dólares siguen en verificación hace más de 24 h');
    end if;
  end if;

  return jsonb_build_object('generado_at', now(), 'alertas', v);
end;
$function$;

create or replace function public.reembolsos_en_verificacion()
returns table (id uuid, pago_id uuid, proveedor text, monto numeric, motivo text, nota text,
               origen text, error text, created_at timestamptz, cliente_legajo text,
               proveedor_orden_id text, monto_pago numeric, metodo text)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  perform public.exigir_backoffice();
  return query
    select r.id, r.pago_id, r.proveedor, r.monto, r.motivo, r.nota, r.origen, r.error, r.created_at,
           p.cliente_legajo, p.proveedor_orden_id, p.monto, p.metodo
      from public.reembolsos r
      join public.pagos p on p.id = r.pago_id
     where r.estado = 'solicitado'
     order by r.created_at;
end;
$$;

create or replace function public.resolver_reembolso(p_id uuid, p_ok boolean, p_nota text)
returns public.reembolsos
language plpgsql
security definer
set search_path to ''
as $$
declare
  r public.reembolsos;
begin
  perform public.exigir_backoffice();
  if coalesce(trim(p_nota), '') = '' then
    raise exception 'Falta la nota (qué se vio en el panel del proveedor)';
  end if;
  r := public.finalizar_reembolso(
    p_id, p_ok, null,
    jsonb_build_object('resuelto_por', auth.uid(), 'resuelto_at', now(), 'nota', trim(p_nota)),
    case when p_ok then null else 'Resuelto como no hecho: ' || trim(p_nota) end);
  return r;
end;
$$;

revoke all on function public.reembolsos_en_verificacion() from public, anon;
revoke all on function public.resolver_reembolso(uuid, boolean, text) from public, anon;
grant execute on function public.reembolsos_en_verificacion() to authenticated;
grant execute on function public.resolver_reembolso(uuid, boolean, text) to authenticated;
