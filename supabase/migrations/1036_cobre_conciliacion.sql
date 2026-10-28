-- Fase C5 de Cobre: conciliación diaria, devoluciones y alertas.
--
-- - Diferencias de conciliación: tipo nuevo `saldo_distinto` (saldo de los Cobre Balances contra
--   el ledger de JPay: BANCO_COBRE + depósitos sin asignar).
-- - `cobre_depositos`: seguimiento de la devolución de un depósito (`/money_movements_return`,
--   solo para depósitos sin asignar; uno acreditado se ajusta desde el backoffice).
-- - `alertas_proveedor_pagos`: para `cobre` suma transferencias trabadas, aprobaciones esperando
--   y depósitos sin dueño (además de avisos, revisión de pendientes y conciliación).
-- - pg_cron diario (09:30 UTC) de `cobre-conciliacion`.
-- Aditiva.

alter table public.conciliacion_proveedor_diferencias
  drop constraint if exists conciliacion_proveedor_diferencias_tipo_check;
alter table public.conciliacion_proveedor_diferencias
  add constraint conciliacion_proveedor_diferencias_tipo_check check (tipo in (
    'falta_en_jpay', 'falta_en_proveedor', 'monto_distinto', 'estado_distinto', 'saldo_distinto'
  ));

alter table public.cobre_depositos
  add column if not exists devolucion_mm_id text,
  add column if not exists devolucion_estado text,
  add column if not exists devolucion_motivo text,
  add column if not exists devuelto_at timestamptz;

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
  end if;

  return jsonb_build_object('generado_at', now(), 'alertas', v);
end;
$$;


select cron.unschedule(jobid) from cron.job where jobname = 'cobre-conciliacion';
select cron.schedule(
  'cobre-conciliacion',
  '30 9 * * *',
  $$
  select net.http_post(
    url := 'https://ovbozgezuboftcjwxlwj.supabase.co/functions/v1/cobre-conciliacion',
    headers := '{"content-type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
