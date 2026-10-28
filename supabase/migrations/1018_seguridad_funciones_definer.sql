-- Seguridad: funciones SECURITY DEFINER que se podían ejecutar sin sesión (anon) o con cualquier
-- sesión, sin verificar quién llamaba (heredadas de MoliPay). Revisión del 2026-10-27.
--
-- 1) Funciones de control reutilizables (`exigir_*`): cortan con 42501 si quien llama no tiene
--    acceso. Las llamadas directas a la base (sin PostgREST: migraciones, cron) y el service role
--    pasan siempre.
-- 2) Auxiliares internas y funciones de servidor/webhook: se revoca EXECUTE a anon y
--    authenticated. Solo las llaman otras funciones SECURITY DEFINER (verificado: ninguna política
--    RLS, vista ni función SECURITY INVOKER las usa) o el service role.
-- 3) Funciones que usa el frontend: se les agrega el control al principio del cuerpo (marcado
--    con "control de acceso (migración 1018)"); el resto del cuerpo queda igual.
--
-- Quedan públicas a propósito (checkout de links de pago): obtener_link_pago,
-- incrementar_vistas_link.

-- ---------------------------------------------------------------------------------------------
-- 1) Controles
-- ---------------------------------------------------------------------------------------------

create or replace function public._llamada_confiable()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  -- Sin claims de PostgREST = conexión directa a la base (rol con credenciales propias).
  select coalesce(auth.role(), 'directa') in ('service_role', 'directa');
$$;

create or replace function public.exigir_backoffice()
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not (public._llamada_confiable() or public.es_backoffice()) then
    raise exception 'Sin permiso para esta operación' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.exigir_permiso(p_recurso text, p_accion text)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not (public._llamada_confiable() or public.rls_tiene_permiso(p_recurso, p_accion)) then
    raise exception 'Sin permiso para esta operación' using errcode = '42501';
  end if;
end;
$$;

-- Backoffice o el cliente dueño del legajo.
create or replace function public.exigir_acceso_legajo(p_legajo text)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if public._llamada_confiable() or public.es_backoffice() then
    return;
  end if;
  if p_legajo is null or p_legajo is distinct from public.current_cliente_legajo() then
    raise exception 'Sin permiso para esta operación' using errcode = '42501';
  end if;
end;
$$;

-- Backoffice o el cliente dueño del comercio (null = todos los comercios: solo backoffice).
create or replace function public.exigir_acceso_comercio(p_comercio_id uuid)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if public._llamada_confiable() or public.es_backoffice() then
    return;
  end if;
  if p_comercio_id is null or not exists (
    select 1 from public.comercios c
    where c.id = p_comercio_id and c.legajo = public.current_cliente_legajo()
  ) then
    raise exception 'Sin permiso para esta operación' using errcode = '42501';
  end if;
end;
$$;

-- Backoffice o el cliente dueño del lote de cobros masivos.
create or replace function public.exigir_acceso_lote(p_lote_id text)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  perform public.exigir_acceso_legajo(
    (select l.cliente_legajo from public.lotes l where l.id = p_lote_id)
  );
end;
$$;

revoke execute on function
  public._llamada_confiable(),
  public.exigir_backoffice(),
  public.exigir_permiso(text, text),
  public.exigir_acceso_legajo(text),
  public.exigir_acceso_comercio(uuid),
  public.exigir_acceso_lote(text)
from public, anon;
grant execute on function
  public._llamada_confiable(),
  public.exigir_backoffice(),
  public.exigir_permiso(text, text),
  public.exigir_acceso_legajo(text),
  public.exigir_acceso_comercio(uuid),
  public.exigir_acceso_lote(text)
to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 2) Solo internas / servidor: sin EXECUTE para anon ni authenticated
-- ---------------------------------------------------------------------------------------------

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        -- auxiliares de movimientos, saldos, ledger y alertas
        '_alerta_desde_plaft', '_ensure_subaccount', '_evaluar_retiros_fallidos',
        '_ledger_reverse', '_rechazar_retiro', '_registrar_alerta', '_registrar_bloqueo_regla',
        '_subaccount_add_conciliado', '_tx_confirmar_transferencia', '_tx_operacion_interna',
        '_tx_reservar_transferencia', 'ledger_post', 'evaluar_reglas_operacion',
        -- servidor / webhooks (ningún frontend las llama)
        'registrar_deposito_entrante', 'registrar_pago_link', 'registrar_pago_link_completo',
        'registrar_pago_payway', 'registrar_transferencia_bdc_detallada',
        'reservar_transferencia_servicio', 'confirmar_adelanto', 'incrementar_vistas_lote',
        -- diagnóstico
        'rpc_debug_log_por_comercio', 'rpc_debug_log_por_pago', 'rpc_debug_log_recientes',
        'rpc_debug_log_resumen', 'rpc_debug_log_truncar'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 3) Funciones del frontend: control al principio del cuerpo
-- ---------------------------------------------------------------------------------------------

-- actualizar_estado_lote(p_lote_id text, p_estado text)
CREATE OR REPLACE FUNCTION public.actualizar_estado_lote(p_lote_id text, p_estado text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- control de acceso (migración 1018)
  select public.exigir_acceso_lote(p_lote_id);
  update public.lotes
     set estado = p_estado,
         fecha_inicio = case when p_estado = 'en_proceso' then now() else fecha_inicio end,
         fecha_finalizacion = case when p_estado = 'finalizado' then now() else fecha_finalizacion end
   where id = p_lote_id;
$function$;

-- actualizar_link_registro(p_registro_id text, p_link text)
CREATE OR REPLACE FUNCTION public.actualizar_link_registro(p_registro_id text, p_link text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- control de acceso (migración 1018)
  select public.exigir_acceso_lote((select r.lote_id from public.lote_registros r where r.id = p_registro_id));
  update public.lote_registros set link_de_pago = p_link where id = p_registro_id;
$function$;

-- agregar_registros_lote(p_lote_id text, p_registros jsonb)
CREATE OR REPLACE FUNCTION public.agregar_registros_lote(p_lote_id text, p_registros jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
  v_reg jsonb;
begin
  -- control de acceso (migración 1018)
  perform public.exigir_acceso_lote(p_lote_id);
  for v_reg in select jsonb_array_elements(p_registros)
  loop
    insert into public.lote_registros (
      id, lote_id, tipo_entidad, id_entidad, sub_entidad,
      identificacion_usuario, monto, descripcion, email,
      periodo_facturacion, id_unico_beneficiario,
      fecha_venc_1, fecha_venc_2, fecha_venc_3,
      tasa_interes, medios_pago, pagos_parciales
    ) values (
      (v_reg->>'id')::text,
      p_lote_id,
      (v_reg->>'tipo_entidad')::text,
      (v_reg->>'id_entidad')::text,
      (v_reg->>'sub_entidad')::text,
      (v_reg->>'identificacion_usuario')::text,
      (v_reg->>'monto')::numeric,
      coalesce((v_reg->>'descripcion')::text, ''),
      (v_reg->>'email')::text,
      (v_reg->>'periodo_facturacion')::text,
      (v_reg->>'id_unico_beneficiario')::text,
      (v_reg->>'fecha_venc_1')::date,
      (v_reg->>'fecha_venc_2')::date,
      (v_reg->>'fecha_venc_3')::date,
      (v_reg->>'tasa_interes')::numeric,
      (v_reg->>'medios_pago')::jsonb,
      (v_reg->>'pagos_parciales')::boolean
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

-- aplicar_contracargo_retenido(p_contracargo_id uuid, p_lote_id uuid)
CREATE OR REPLACE FUNCTION public.aplicar_contracargo_retenido(p_contracargo_id uuid, p_lote_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_contra        public.contracargos%ROWTYPE;
    v_lote          public.lotes_acreditacion%ROWTYPE;
    v_contracargo_m numeric(14,2);
    v_cierre_monto  numeric(14,2);
    v_nuevo_neto    numeric(14,2);
    v_resuelto_por  uuid;
BEGIN
  -- control de acceso (migración 1018)
  perform public.exigir_permiso('comercios', 'modificar');
    -- 1. Lock del contracargo
    SELECT * INTO v_contra
      FROM public.contracargos
     WHERE id = p_contracargo_id
       FOR UPDATE;
    IF v_contra.id IS NULL THEN
        RAISE EXCEPTION 'Contracargo % no encontrado', p_contracargo_id;
    END IF;
    IF v_contra.estado = 'Cerrado_retenido' THEN
        RAISE EXCEPTION 'El contracargo % ya está cerrado como Retenido', p_contracargo_id;
    END IF;
    IF v_contra.estado = 'Cerrado_acreditado' THEN
        RAISE EXCEPTION 'El contracargo % está cerrado como Acreditado (no se puede revertir a Retenido)', p_contracargo_id;
    END IF;
    IF v_contra.importe IS NULL OR v_contra.importe <= 0 THEN
        RAISE EXCEPTION 'El contracargo % no tiene importe válido para aplicar', p_contracargo_id;
    END IF;

    -- 2. Lock del lote destino
    SELECT * INTO v_lote
      FROM public.lotes_acreditacion
     WHERE id = p_lote_id
       FOR UPDATE;
    IF v_lote.id IS NULL THEN
        RAISE EXCEPTION 'Lote % no encontrado', p_lote_id;
    END IF;
    IF v_lote.estado = 'Acreditado' THEN
        RAISE EXCEPTION 'El lote % ya está Acreditado; para descontar de un lote ya acreditado usá Saldo Disponible', p_lote_id;
    END IF;
    IF v_lote.comercio_id IS DISTINCT FROM v_contra.comercio_id THEN
        RAISE EXCEPTION 'El lote % no pertenece al comercio del contracargo', p_lote_id;
    END IF;

    -- 3. Calcular el nuevo contracargo_monto del lote y el nuevo neto
    v_contracargo_m := COALESCE(v_lote.contracargo_monto, 0) + v_contra.importe;
    v_cierre_monto  := COALESCE(v_lote.comision_cierre_lote_monto, 0);
    v_nuevo_neto    := v_lote.importe_bruto
                       - COALESCE(v_lote.impuestos, 0)
                       - COALESCE(v_lote.tasa_payway_monto, 0)
                       - COALESCE(v_lote.tasa_molipay_monto, 0)
                       - v_contracargo_m
                       - v_cierre_monto;

    -- 4. Resolver el operador actual
    BEGIN
        v_resuelto_por := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_resuelto_por := NULL;
    END;

    -- 5. Update del lote
    UPDATE public.lotes_acreditacion
       SET contracargo_monto    = v_contracargo_m,
           importe_neto        = v_nuevo_neto,
           es_estimado         = false,
           fecha_estimada_recalcular = false,
           updated_at          = now()
     WHERE id = p_lote_id;

    -- 6. Update del contracargo
    UPDATE public.contracargos
       SET estado          = 'Cerrado_retenido',
           lote_sugerido_id = p_lote_id,
           fecha_cierre    = now(),
           resuelto_por    = v_resuelto_por,
           updated_at      = now()
     WHERE id = p_contracargo_id;

    -- 7. Respuesta
    RETURN jsonb_build_object(
        'contracargo_id', p_contracargo_id,
        'lote_id', p_lote_id,
        'lote_codigo', v_lote.codigo,
        'importe_descontado', v_contra.importe,
        'lote_contracargo_monto', v_contracargo_m,
        'lote_importe_neto', v_nuevo_neto,
        'estado', 'Cerrado_retenido'
    );
END;
$function$;

-- calcular_retenciones_lote(p_lote_id uuid)
CREATE OR REPLACE FUNCTION public.calcular_retenciones_lote(p_lote_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    -- Contexto del lote
    v_legajo                    text;
    v_cuit                      text;
    v_importe_bruto             numeric(14,2);
    v_tasa_molipay_pct          numeric(7,4);
    v_comision_molipay_monto    numeric(14,2);
    v_base_imponible            numeric(14,2);

    -- Tasas default (parametros_globales)
    v_dc_pct                    numeric(7,4);
    v_iva_pct                   numeric(7,4);

    -- Asignaciones del cliente
    v_dc_asig_tipo              text;
    v_dc_asig_monto             numeric(14,4);
    v_dc_asignado               boolean := false;

    v_iva_asig_tipo             text;
    v_iva_asig_monto            numeric(14,4);
    v_iva_asignado              boolean := false;

    v_iibb_asig_tipo            text;
    v_iibb_asig_monto           numeric(14,4);
    v_iibb_asignado             boolean := false;

    -- Exención DC
    v_dc_exento                 boolean := false;
    v_dc_motivo                 text;

    -- Montos finales
    v_dc_monto                  numeric(14,2) := 0;
    v_iva_monto                 numeric(14,2) := 0;
    v_iibb_monto                numeric(14,2) := 0;

    -- Auditoría
    v_asignaciones_consultadas  jsonb;
BEGIN
  -- control de acceso (migración 1018)
  perform public.exigir_backoffice();
    -- 1. Contexto del lote.
    SELECT
        c.legajo,
        cli.cuit,
        la.importe_bruto,
        la.tasa_molipay_pct,
        la.tasa_molipay_monto
      INTO v_legajo, v_cuit, v_importe_bruto, v_tasa_molipay_pct, v_comision_molipay_monto
      FROM public.lotes_acreditacion la
      JOIN public.comercios c ON c.id = la.comercio_id
      LEFT JOIN public.clientes cli ON cli.legajo = c.legajo
     WHERE la.id = p_lote_id;

    IF v_legajo IS NULL THEN
        RAISE EXCEPTION 'Lote % no encontrado o sin comercio asociado', p_lote_id;
    END IF;
    IF v_cuit IS NULL OR v_cuit = '' THEN
        RAISE EXCEPTION 'El cliente del lote (legajo %) no tiene CUIT cargado. Cargalo antes de calcular retenciones.', v_legajo;
    END IF;

    -- 2. Base imponible: Monto Bruto del Lote (según spec).
    v_base_imponible := v_importe_bruto;

    -- 3. Tasas default desde parametros_globales.
    v_dc_pct  := public.leer_parametro_numerico('debito_credito_pct', 0.6);
    v_iva_pct := public.leer_parametro_numerico('iva_sobre_comision_pct', 21);

    -- 4. Asignaciones del legajo.
    --    DC
    SELECT tipo, monto INTO v_dc_asig_tipo, v_dc_asig_monto
      FROM public.buscar_asignacion_impuesto(v_legajo, 'DC');
    v_dc_asignado := v_dc_asig_tipo IS NOT NULL;

    --    IVA
    SELECT tipo, monto INTO v_iva_asig_tipo, v_iva_asig_monto
      FROM public.buscar_asignacion_impuesto(v_legajo, 'IVA');
    v_iva_asignado := v_iva_asig_tipo IS NOT NULL;

    --    IIBB (auditoría por ahora; cálculo manual)
    SELECT tipo, monto INTO v_iibb_asig_tipo, v_iibb_asig_monto
      FROM public.buscar_asignacion_impuesto(v_legajo, 'IIBB');
    v_iibb_asignado := v_iibb_asig_tipo IS NOT NULL;

    -- 5. Cálculo de cada retención.
    -- 5.1 Débito/Crédito: si no está asignado al cliente, monto = 0.
    IF NOT v_dc_asignado THEN
        v_dc_monto := 0;
        v_dc_motivo := format('El cliente (legajo %) no tiene el impuesto DC asignado en impuestos_asignaciones. No se aplica.', v_legajo);
    ELSE
        -- Primero chequear exención por CUIT.
        SELECT EXISTS (
            SELECT 1
              FROM public.dc_excepciones
             WHERE cuit = v_cuit
               AND estado = 'Activo'
               AND direccion = 'Entrantes'
               AND (vigencia_hasta IS NULL OR vigencia_hasta >= CURRENT_DATE)
        ) INTO v_dc_exento;

        IF v_dc_exento THEN
            v_dc_monto := 0;
            v_dc_motivo := format('Exento según dc_excepciones vigente (CUIT %s)', v_cuit);
        ELSE
            IF v_dc_asig_tipo = 'Porcentaje' THEN
                v_dc_monto := round((v_base_imponible * v_dc_asig_monto) / 100, 2);
                v_dc_motivo := format('Alícuota %s%% del legajo (asignación) sobre base imponible $%s. CUIT %s sin exención.', v_dc_asig_monto, v_base_imponible, v_cuit);
            ELSIF v_dc_asig_tipo = 'Fijo' THEN
                v_dc_monto := v_dc_asig_monto;
                v_dc_motivo := format('Monto fijo del legajo (asignación tipo=Fijo): $%s. CUIT %s sin exención.', v_dc_asig_monto, v_cuit);
            ELSE
                -- Tipo desconocido: fallback al parametro global.
                v_dc_monto := round((v_base_imponible * v_dc_pct) / 100, 2);
                v_dc_motivo := format('Asignación de tipo desconocido; usando parámetro global %s%%. CUIT %s sin exención.', v_dc_pct, v_cuit);
            END IF;
        END IF;
    END IF;

    -- 5.2 IVA: sobre la comisión de MoliPay (prestación). Si no
    --     está asignado al cliente, monto = 0.
    IF NOT v_iva_asignado THEN
        v_iva_monto := 0;
    ELSE
        IF v_comision_molipay_monto IS NULL OR v_comision_molipay_monto = 0 THEN
            v_iva_monto := 0;
        ELSIF v_iva_asig_tipo = 'Porcentaje' THEN
            v_iva_monto := round((v_comision_molipay_monto * v_iva_asig_monto) / 100, 2);
        ELSIF v_iva_asig_tipo = 'Fijo' THEN
            v_iva_monto := v_iva_asig_monto;
        ELSE
            v_iva_monto := round((v_comision_molipay_monto * v_iva_pct) / 100, 2);
        END IF;
    END IF;

    -- 5.3 IIBB: si el cliente lo tiene asignado tipo='Porcentaje', se
    --     calcula automáticamente. Si tipo='Fijo', se toma el monto
    --     de la asignación. Si no está asignado, queda en $0 y se
    --     carga a mano desde el modal.
    IF v_iibb_asignado THEN
        IF v_iibb_asig_tipo = 'Porcentaje' THEN
            v_iibb_monto := round((v_base_imponible * v_iibb_asig_monto) / 100, 2);
        ELSIF v_iibb_asig_tipo = 'Fijo' THEN
            v_iibb_monto := v_iibb_asig_monto;
        ELSE
            v_iibb_monto := 0;
        END IF;
    END IF;

    -- 6. Auditoría: todas las asignaciones activas del legajo.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'impuesto_codigo', i.codigo,
        'impuesto_nombre', i.nombre,
        'tipo', ia.tipo,
        'monto', ia.monto,
        'estado', ia.estado
    ) ORDER BY i.codigo), '[]'::jsonb)
      INTO v_asignaciones_consultadas
      FROM public.impuestos_asignaciones ia
      JOIN public.impuestos i ON i.id = ia.impuesto_id
     WHERE ia.legajo = v_legajo
       AND ia.estado = 'Activo'
       AND i.estado = 'Activo';

    -- 7. Respuesta.
    RETURN jsonb_build_object(
        'lote_id',           p_lote_id,
        'legajo',            v_legajo,
        'cuit',              v_cuit,
        'base_imponible',    v_base_imponible,
        'comision_molipay_monto', v_comision_molipay_monto,
        'debito_credito',    jsonb_build_object(
            'monto',         v_dc_monto,
            'alicuota_pct',  CASE WHEN v_dc_asignado AND v_dc_asig_tipo = 'Porcentaje' THEN v_dc_asig_monto
                                  WHEN NOT v_dc_exento THEN v_dc_pct
                                  ELSE NULL END,
            'asignado',      v_dc_asignado,
            'asig_tipo',     v_dc_asig_tipo,
            'asig_monto',    v_dc_asig_monto,
            'exento',        v_dc_exento,
            'motivo',        v_dc_motivo,
            'aplicado',      v_dc_asignado  -- no se "aplica" si no está asignado
        ),
        'iva',               jsonb_build_object(
            'monto',         v_iva_monto,
            'alicuota_pct',  CASE WHEN v_iva_asignado AND v_iva_asig_tipo = 'Porcentaje' THEN v_iva_asig_monto
                                  WHEN v_comision_molipay_monto > 0 THEN v_iva_pct
                                  ELSE NULL END,
            'asignado',      v_iva_asignado,
            'asig_tipo',     v_iva_asig_tipo,
            'asig_monto',    v_iva_asig_monto,
            'motivo',        CASE
                WHEN NOT v_iva_asignado THEN format('El cliente (legajo %) no tiene el impuesto IVA asignado en impuestos_asignaciones. No se aplica.', v_legajo)
                WHEN v_comision_molipay_monto IS NULL OR v_comision_molipay_monto = 0 THEN 'Sin comisión MoliPay → IVA = $0'
                ELSE format('Alícuota %s%% del legajo sobre comisión MoliPay $%s', v_iva_asig_monto, v_comision_molipay_monto)
            END,
            'aplicado',      v_iva_asignado
        ),
        'iibb',              jsonb_build_object(
            'monto',         v_iibb_monto,
            'asignado',      v_iibb_asignado,
            'asig_tipo',     v_iibb_asig_tipo,
            'asig_monto',    v_iibb_asig_monto,
            'motivo',        CASE
                WHEN NOT v_iibb_asignado THEN 'IIBB no asignado al cliente. Carga manual desde el modal.'
                WHEN v_iibb_asig_tipo = 'Porcentaje' THEN format('Alícuota %s%% del legajo sobre base imponible $%s', v_iibb_asig_monto, v_base_imponible)
                WHEN v_iibb_asig_tipo = 'Fijo' THEN format('Monto fijo del legajo (asignación tipo=Fijo): $%s', v_iibb_asig_monto)
                ELSE 'IIBB asignado con tipo desconocido.'
            END,
            'aplicado',      v_iibb_asignado
        ),
        'total_retenciones', round(v_dc_monto + v_iva_monto + v_iibb_monto, 2),
        'asignaciones_consultadas', v_asignaciones_consultadas
    );
END;
$function$;

-- calendario_acreditaciones_v2(p_mes integer, p_anio integer, p_comercio_id uuid, p_bandera text, p_estado text)
CREATE OR REPLACE FUNCTION public.calendario_acreditaciones_v2(p_mes integer, p_anio integer, p_comercio_id uuid DEFAULT NULL::uuid, p_bandera text DEFAULT NULL::text, p_estado text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_primer_dia date := make_date(p_anio, p_mes, 1);
    v_ultimo_dia date := (v_primer_dia + interval '1 month - 1 day')::date;
    v_hoy        date := current_date;
    v_adelantos  jsonb;
    v_result     jsonb;
BEGIN
  -- control de acceso (migración 1018)
  perform public.exigir_acceso_comercio(p_comercio_id);
    -- Traemos TODOS los adelantos Pendiente/Aprobado (a nivel comercio)
    -- y los agrupamos por comercio_id con su suma. Después, en cada fila
    -- del calendario, vamos imputando FIFO contra los días del mes.
    SELECT COALESCE(jsonb_object_agg(a.comercio_id, a.total), '{}'::jsonb)
      INTO v_adelantos
      FROM (
        SELECT comercio_id, SUM(monto_por_acreditar) AS total
          FROM public.adelantos
         WHERE estado IN ('Pendiente', 'Aprobado')
           AND monto_por_acreditar IS NOT NULL
           AND monto_por_acreditar > 0
         GROUP BY comercio_id
      ) a;

    -- Generamos el JSON con un array de filas.
    -- Schema real: la.fecha es la fecha de venta.
    WITH lotes_mes AS (
        SELECT
            la.id,
            la.codigo,
            la.comercio_id,
            la.bandera,
            la.fecha                                       AS fecha_venta,
            la.dias_habiles_aplicados,
            la.cantidad_operaciones,
            la.importe_bruto,
            la.impuestos,
            la.tasa_payway_pct,
            la.tasa_payway_monto,
            la.tasa_molipay_pct,
            la.tasa_molipay_monto,
            la.comision_cierre_lote_monto,
            la.contracargo_monto,
            la.importe_neto,
            la.estado                                      AS estado_lote,
            la.fecha_resolucion,
            com.usuario,
            com.legajo,
            com.nombre_comercio
          FROM public.lotes_acreditacion la
          JOIN public.comercios com ON com.id = la.comercio_id
         WHERE la.estado IN ('Programado', 'Pendiente', 'Rechazado', 'Contracargo', 'Acreditado')
           AND (
               -- La acreditación cae en el mes:
               --   - Lotes ya Acreditados: usamos fecha_resolucion.
               --   - Lotes NO Acreditados: calculamos fecha + N días hábiles.
               (la.estado = 'Acreditado'
                  AND la.fecha_resolucion IS NOT NULL
                  AND date_trunc('month', la.fecha_resolucion) = v_primer_dia)
               OR
               (la.estado <> 'Acreditado'
                  AND public.calcular_fecha_limite_mediacion(
                        la.fecha::timestamptz,
                        COALESCE(la.dias_habiles_aplicados, 20)
                     )::date BETWEEN v_primer_dia AND v_ultimo_dia)
           )
    ),
    calculadas AS (
        SELECT
            l.*,
            CASE
                WHEN l.estado_lote = 'Acreditado' THEN date_trunc('day', l.fecha_resolucion)::date
                ELSE public.calcular_fecha_limite_mediacion(
                    l.fecha_venta::timestamptz,
                    COALESCE(l.dias_habiles_aplicados, 20)
                )::date
            END AS fecha_acreditacion,
            CASE
                WHEN l.estado_lote = 'Acreditado' THEN 'acreditado'
                WHEN l.estado_lote = 'Contracargo' OR l.contracargo_monto > 0 THEN 'contracargo'
                WHEN l.estado_lote = 'Pendiente' THEN 'pendiente'
                WHEN l.estado_lote = 'Programado'
                     AND public.calcular_fecha_limite_mediacion(
                            l.fecha_venta::timestamptz,
                            COALESCE(l.dias_habiles_aplicados, 20)
                         )::date >= v_hoy
                    THEN 'programado'
                ELSE 'pendiente'
            END AS estado_calculado
          FROM lotes_mes l
    )
    SELECT COALESCE(jsonb_agg(row_to_json_calc), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT
            c.id,
            c.codigo,
            c.comercio_id,
            c.comercio_nombre,
            c.comercio_legajo,
            c.bandera,
            c.fecha_venta,
            c.fecha_acreditacion,
            c.dias_habiles_aplicados,
            c.cantidad_operaciones,
            c.importe_bruto,
            c.impuestos,
            c.tasa_payway_pct,
            c.tasa_payway_monto,
            c.tasa_molipay_pct,
            c.tasa_molipay_monto,
            c.comision_cierre_lote_monto,
            c.contracargo_monto,
            c.importe_neto,
            c.estado_lote,
            c.estado_calculado,
            COALESCE((v_adelantos ->> c.comercio_id::text)::numeric, 0)
                AS adelantos_reservados_total,
            LEAST(
                COALESCE((v_adelantos ->> c.comercio_id::text)::numeric, 0),
                GREATEST(c.importe_neto, 0)
            ) AS adelantos_aplicados_dia
          FROM (
            SELECT
                id,
                codigo,
                comercio_id,
                nombre_comercio AS comercio_nombre,
                legajo          AS comercio_legajo,
                bandera,
                fecha_venta,
                fecha_acreditacion,
                dias_habiles_aplicados,
                cantidad_operaciones,
                importe_bruto,
                impuestos,
                tasa_payway_pct,
                tasa_payway_monto,
                tasa_molipay_pct,
                tasa_molipay_monto,
                comision_cierre_lote_monto,
                contracargo_monto,
                importe_neto,
                estado_lote,
                estado_calculado
              FROM calculadas
             WHERE (p_comercio_id IS NULL OR comercio_id = p_comercio_id)
               AND (p_bandera     IS NULL OR bandera = p_bandera)
               AND (p_estado      IS NULL OR estado_calculado = p_estado)
          ) c
      ) row_to_json_calc;

    RETURN v_result;
END;
$function$;

-- calendario_adelantos_por_dia(p_comercio_id uuid, p_fecha date)
CREATE OR REPLACE FUNCTION public.calendario_adelantos_por_dia(p_comercio_id uuid, p_fecha date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
  -- control de acceso (migración 1018)
  perform public.exigir_acceso_comercio(p_comercio_id);
    IF p_comercio_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(a)), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT
            id,
            monto_solicitado,
            monto_por_acreditar,
            plazo_original_dias,
            plazo_adelantado_dias,
            tasa_interes_pct,
            estado,
            fecha_solicitud,
            fecha_resolucion,
            fecha_acreditacion,
            motivo
          FROM public.adelantos
         WHERE comercio_id = p_comercio_id
           AND estado IN ('Pendiente', 'Aprobado', 'Acreditado')
         ORDER BY
             CASE WHEN p_fecha IS NULL THEN fecha_solicitud END DESC,
             CASE
                 WHEN p_fecha IS NOT NULL
                  AND estado = 'Acreditado'
                  AND date(fecha_acreditacion) = p_fecha THEN 0
                 WHEN p_fecha IS NOT NULL
                  AND estado IN ('Pendiente', 'Aprobado') THEN 1
                 ELSE 2
             END,
             fecha_solicitud DESC
         LIMIT 20
      ) a;

    RETURN v_result;
END;
$function$;

-- calendario_exportar_dia(p_fecha date, p_comercio_id uuid)
CREATE OR REPLACE FUNCTION public.calendario_exportar_dia(p_fecha date, p_comercio_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
  -- control de acceso (migración 1018)
  perform public.exigir_acceso_comercio(p_comercio_id);
    SELECT COALESCE(jsonb_agg(row_to_json(l)), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT
            la.id,
            la.codigo,
            la.comercio_id,
            com.nombre_comercio,
            com.legajo,
            la.bandera,
            la.fecha,
            la.cantidad_operaciones,
            la.importe_bruto,
            la.impuestos,
            la.tasa_payway_pct,
            la.tasa_payway_monto,
            la.tasa_molipay_pct,
            la.tasa_molipay_monto,
            la.comision_cierre_lote_monto,
            la.contracargo_monto,
            la.importe_neto,
            la.estado
          FROM public.lotes_acreditacion la
          JOIN public.comercios com ON com.id = la.comercio_id
         WHERE date(la.fecha) = p_fecha
           AND (p_comercio_id IS NULL OR la.comercio_id = p_comercio_id)
         ORDER BY com.nombre_comercio, la.bandera
      ) l;

    RETURN v_result;
END;
$function$;

-- calendario_resumen_saldos(p_comercio_id uuid)
CREATE OR REPLACE FUNCTION public.calendario_resumen_saldos(p_comercio_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_falta_cobrar      numeric(18,2) := 0;
    v_por_acreditar     numeric(18,2) := 0;
    v_adelantos_curso   numeric(18,2) := 0;
BEGIN
  -- control de acceso (migración 1018)
  perform public.exigir_acceso_comercio(p_comercio_id);
    -- Falta cobrar: ventas que ya están en lotes_venta pero todavía no
    -- tienen un lote_acreditacion generado.
    -- Joineamos por (comercio_id, bandera, fecha) — el UNIQUE constraint
    -- de lotes_acreditacion garantiza que cada venta tiene un único lote.
    IF p_comercio_id IS NULL THEN
        SELECT COALESCE(SUM(lv.importe_bruto), 0) INTO v_falta_cobrar
          FROM public.lotes_venta lv
         WHERE NOT EXISTS (
             SELECT 1
               FROM public.lotes_acreditacion la
              WHERE la.comercio_id = lv.comercio_id
                AND la.bandera     = lv.bandera
                AND la.fecha       = lv.fecha
         );
    ELSE
        SELECT COALESCE(SUM(lv.importe_bruto), 0) INTO v_falta_cobrar
          FROM public.lotes_venta lv
         WHERE lv.comercio_id = p_comercio_id
           AND NOT EXISTS (
               SELECT 1
                 FROM public.lotes_acreditacion la
                WHERE la.comercio_id = lv.comercio_id
                  AND la.bandera     = lv.bandera
                  AND la.fecha       = lv.fecha
           );
    END IF;

    -- Por acreditar: Σ importe_neto de lotes NO Acreditados
    IF p_comercio_id IS NULL THEN
        SELECT COALESCE(SUM(importe_neto), 0) INTO v_por_acreditar
          FROM public.lotes_acreditacion
         WHERE estado IN ('Programado', 'Pendiente', 'Rechazado', 'Contracargo');
    ELSE
        SELECT COALESCE(SUM(importe_neto), 0) INTO v_por_acreditar
          FROM public.lotes_acreditacion
         WHERE comercio_id = p_comercio_id
           AND estado IN ('Programado', 'Pendiente', 'Rechazado', 'Contracargo');
    END IF;

    -- Adelantos en curso: Pendiente + Aprobado
    IF p_comercio_id IS NULL THEN
        SELECT COALESCE(SUM(monto_por_acreditar), 0) INTO v_adelantos_curso
          FROM public.adelantos
         WHERE estado IN ('Pendiente', 'Aprobado')
           AND monto_por_acreditar IS NOT NULL
           AND monto_por_acreditar > 0;
    ELSE
        SELECT COALESCE(SUM(monto_por_acreditar), 0) INTO v_adelantos_curso
          FROM public.adelantos
         WHERE comercio_id = p_comercio_id
           AND estado IN ('Pendiente', 'Aprobado')
           AND monto_por_acreditar IS NOT NULL
           AND monto_por_acreditar > 0;
    END IF;

    RETURN jsonb_build_object(
        'falta_cobrar', v_falta_cobrar,
        'por_acreditar', v_por_acreditar,
        'adelantos_en_curso', v_adelantos_curso,
        'disponible_real', GREATEST(v_por_acreditar - v_adelantos_curso, 0)
    );
END;
$function$;

-- crear_lote(p_id text, p_cliente_legajo text, p_nombre text, p_periodo text, p_dia_pago integer, p_tasa_interes numeric, p_fecha_venc_1 date, p_fecha_venc_2 date, p_fecha_venc_3 date, p_medios_pago jsonb, p_pagos_parciales boolean, p_notificaciones boolean)
CREATE OR REPLACE FUNCTION public.crear_lote(p_id text, p_cliente_legajo text, p_nombre text, p_periodo text, p_dia_pago integer, p_tasa_interes numeric, p_fecha_venc_1 date, p_fecha_venc_2 date, p_fecha_venc_3 date, p_medios_pago jsonb, p_pagos_parciales boolean, p_notificaciones boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- control de acceso (migración 1018)
  select public.exigir_acceso_legajo(p_cliente_legajo);
  insert into public.lotes (
    id, cliente_legajo, nombre, periodo, dia_pago, tasa_interes,
    fecha_venc_1, fecha_venc_2, fecha_venc_3,
    medios_pago, pagos_parciales, notificaciones
  ) values (
    p_id, p_cliente_legajo, p_nombre, p_periodo, p_dia_pago, p_tasa_interes,
    p_fecha_venc_1, p_fecha_venc_2, p_fecha_venc_3,
    p_medios_pago, p_pagos_parciales, p_notificaciones
  );
$function$;

-- eliminar_lote(p_lote_id text)
CREATE OR REPLACE FUNCTION public.eliminar_lote(p_lote_id text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- control de acceso (migración 1018)
  select public.exigir_acceso_lote(p_lote_id);
  update public.lotes set estado = 'eliminado' where id = p_lote_id;
$function$;

-- fn_aprobar_adelanto(p_adelanto_id uuid, p_tasa_pct numeric, p_notas text)
CREATE OR REPLACE FUNCTION public.fn_aprobar_adelanto(p_adelanto_id uuid, p_tasa_pct numeric, p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_estado text;
    v_monto numeric(14, 2);
    v_comercio_id uuid;
    v_uid uuid;
BEGIN
  -- control de acceso (migración 1018)
  perform public.exigir_permiso('adelantos', 'modificar');
    SELECT estado, monto_solicitado, comercio_id
      INTO v_estado, v_monto, v_comercio_id
      FROM public.adelantos
     WHERE id = p_adelanto_id
     FOR UPDATE;

    IF v_estado IS NULL THEN
        RAISE EXCEPTION 'Adelanto % no encontrado', p_adelanto_id;
    END IF;
    IF v_estado <> 'Pendiente' THEN
        RAISE EXCEPTION 'El adelanto % debe estar Pendiente para aprobarse (estado actual: %)', p_adelanto_id, v_estado;
    END IF;
    IF p_tasa_pct IS NULL OR p_tasa_pct < 0 OR p_tasa_pct > 100 THEN
        RAISE EXCEPTION 'La tasa debe estar entre 0 y 100';
    END IF;

    -- Resuelto_por: auth.uid() si está disponible
    BEGIN
        v_uid := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_uid := NULL;
    END;

    UPDATE public.adelantos
       SET estado = 'Aprobado',
           tasa_interes_pct = p_tasa_pct,
           fecha_resolucion = now(),
           resuelto_por = COALESCE(v_uid, resuelto_por),
           updated_at = now()
     WHERE id = p_adelanto_id;

    RETURN jsonb_build_object(
        'adelanto_id', p_adelanto_id,
        'estado', 'Aprobado',
        'tasa_pct', p_tasa_pct,
        'monto_solicitado', v_monto,
        'comercio_id', v_comercio_id
    );
END;
$function$;

-- fn_calcular_tope_disponible(p_comercio_id uuid)
CREATE OR REPLACE FUNCTION public.fn_calcular_tope_disponible(p_comercio_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_lotes numeric(18, 2);
    v_reservas numeric(18, 2);
    v_tope numeric(18, 2);
BEGIN
  -- control de acceso (migración 1018)
  perform public.exigir_acceso_comercio(p_comercio_id);
    IF p_comercio_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(SUM(importe_neto), 0) INTO v_lotes
    FROM public.lotes_acreditacion
    WHERE comercio_id = p_comercio_id
      AND estado IN ('Programado', 'Pendiente', 'Contracargo');

    SELECT COALESCE(SUM(monto_por_acreditar), 0) INTO v_reservas
    FROM public.adelantos
    WHERE comercio_id = p_comercio_id
      AND estado IN ('Pendiente', 'Aprobado')
      AND monto_por_acreditar IS NOT NULL
      AND monto_por_acreditar > 0;

    v_tope := v_lotes - v_reservas;
    IF v_tope < 0 THEN
        v_tope := 0;
    END IF;
    RETURN v_tope;
END;
$function$;

-- resumen_lotes_admin(p_desde date, p_hasta date)
CREATE OR REPLACE FUNCTION public.resumen_lotes_admin(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_programados jsonb;
    v_pendientes jsonb;
    v_acreditados jsonb;
    v_contracargo jsonb;
BEGIN
  -- control de acceso (migración 1018)
  perform public.exigir_backoffice();
    -- Programados / Pendientes / Contracargo: filtran por la fecha del lote
    -- (que es la fecha estimada de acreditación). Para "Contracargo" el
    -- importe relevante es contracargo_monto, no el importe_neto.
    SELECT jsonb_build_object(
        'cantidad', count(*)::int,
        'monto', coalesce(sum(importe_neto), 0)
    ) INTO v_programados
    FROM public.lotes_acreditacion
    WHERE estado = 'Programado'
      AND (p_desde IS NULL OR fecha >= p_desde)
      AND (p_hasta IS NULL OR fecha <= p_hasta);

    SELECT jsonb_build_object(
        'cantidad', count(*)::int,
        'monto', coalesce(sum(importe_neto), 0)
    ) INTO v_pendientes
    FROM public.lotes_acreditacion
    WHERE estado = 'Pendiente'
      AND (p_desde IS NULL OR fecha >= p_desde)
      AND (p_hasta IS NULL OR fecha <= p_hasta);

    -- Acreditados: por fecha de resolución (cuándo se pagó), cayendo a la
    -- fecha del lote si la resolución no tiene timestamp cargado. Esto
    -- permite que el KPI "Acreditados (Mes)" refleje el mes del pago
    -- aunque el lote fuera de otro mes.
    SELECT jsonb_build_object(
        'cantidad', count(*)::int,
        'monto', coalesce(sum(importe_neto), 0)
    ) INTO v_acreditados
    FROM public.lotes_acreditacion
    WHERE estado = 'Acreditado'
      AND (p_desde IS NULL OR coalesce(fecha_resolucion::date, fecha) >= p_desde)
      AND (p_hasta IS NULL OR coalesce(fecha_resolucion::date, fecha) <= p_hasta);

    SELECT jsonb_build_object(
        'cantidad', count(*)::int,
        'monto', coalesce(sum(contracargo_monto), 0)
    ) INTO v_contracargo
    FROM public.lotes_acreditacion
    WHERE estado = 'Contracargo'
      AND (p_desde IS NULL OR fecha >= p_desde)
      AND (p_hasta IS NULL OR fecha <= p_hasta);

    RETURN jsonb_build_object(
        'programados', v_programados,
        'pendientes',  v_pendientes,
        'acreditados', v_acreditados,
        'contracargo', v_contracargo
    );
END;
$function$;

-- rpc_pool_recaudacion()
CREATE OR REPLACE FUNCTION public.rpc_pool_recaudacion()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- control de acceso (migración 1018)
  select public.exigir_backoffice();
    WITH pool AS (
        SELECT COALESCE(SUM(b.saldo_disponible), 0) AS total
          FROM public.subaccounts s
          JOIN public.subaccount_balances b ON b.subaccount_id = s.id
         WHERE s.tipo = 'Recaudacion'
    ),
    reservados AS (
        SELECT COALESCE(SUM(monto_solicitado), 0) AS total
          FROM public.adelantos
         WHERE estado IN ('Aprobado', 'Acreditado')
    )
    SELECT jsonb_build_object(
        'pool_recaudacion_total', (SELECT total FROM pool),
        'adelantos_en_curso',     (SELECT total FROM reservados),
        'cupo_disponible_pool',   (SELECT total FROM pool) - (SELECT total FROM reservados)
    );
$function$;

-- validar_operacion_comercio(p_comercio_id uuid)
CREATE OR REPLACE FUNCTION public.validar_operacion_comercio(p_comercio_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cvu_count INT;
  v_bandera_count INT;
BEGIN
  -- control de acceso (migración 1018)
  perform public.exigir_backoffice();
  -- Verificar que tiene al menos un CVU activo
  SELECT COUNT(*) INTO v_cvu_count
  FROM public.subaccounts
  WHERE comercio_id = p_comercio_id
    AND tipo = 'CVU'
    AND estado = 'Activo';

  -- Verificar que tiene al menos una bandera con comision
  SELECT COUNT(*) INTO v_bandera_count
  FROM comercio_banderas cb
  JOIN comercio_banderas_cuotas cbc ON cb.id = cbc.comercio_bandera_id
  WHERE cb.comercio_id = p_comercio_id
    AND cb.estado = 'Activo'
    AND cbc.estado = 'Activo';

  -- Solo puede operar si tiene ambos
  RETURN (v_cvu_count > 0 AND v_bandera_count > 0);
END;
$function$;

-- Ninguna de las anteriores tiene sentido sin sesión.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'crear_lote', 'eliminar_lote', 'actualizar_estado_lote', 'actualizar_link_registro',
        'agregar_registros_lote', 'aplicar_contracargo_retenido', 'fn_aprobar_adelanto',
        'calcular_retenciones_lote', 'resumen_lotes_admin', 'rpc_pool_recaudacion',
        'validar_operacion_comercio', 'calendario_acreditaciones_v2',
        'calendario_adelantos_por_dia', 'calendario_exportar_dia', 'calendario_resumen_saldos',
        'fn_calcular_tope_disponible'
      )
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;
