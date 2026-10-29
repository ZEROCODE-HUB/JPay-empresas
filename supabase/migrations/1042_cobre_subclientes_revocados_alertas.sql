-- Cobre: Subclientes rechazados después de aprobados y alertas que faltaban (fase D7).
--
-- - Según la guía de Cuentas Nombradas, un Subcliente `approved` puede pasar a `rejected` por una
--   revisión de cumplimiento posterior; Cobre no toca sus cuentas, pero hay que consultarlo con el
--   KAM. Se guarda en `revocado_at` / `revocado_motivo` (el alta sigue `approved`: el Balance existe
--   y opera) y aparece como alerta crítica hasta que alguien la marca revisada.
-- - `alertas_proveedor_pagos('cobre')` suma: envíos USD con el traslado trabado, conversiones sin
--   resultado, altas en revisión hace más de 48 h, altas revocadas, Balances no conectados y
--   destinatarios en dólares sin verificar.
-- Aditiva.

alter table public.cobre_subclientes
  add column if not exists revocado_at timestamptz,
  add column if not exists revocado_motivo text,
  add column if not exists revocado_revisado boolean not null default false;

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
