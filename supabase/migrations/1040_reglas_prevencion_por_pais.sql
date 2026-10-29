-- Reglas de prevención por país.
--
-- Hasta ahora `alert_rules` tenía un solo juego de valores para todos los clientes, calibrado
-- para Argentina (pesos argentinos, SMVM, hora de Buenos Aires). Desde acá cada regla puede tener
-- valores propios por país en `parametros_pais` ({ "MX": { "is_enabled": …, "parameters": {…} } });
-- sin entrada para el país del cliente se usan los generales (Argentina no cambia).
--
-- México:
-- - Montos en pesos mexicanos; hora del centro (America/Mexico_City).
-- - Las reglas "en salarios mínimos" usan la UMA mensual (`uma_mensual_mx`): UMA 2026 = $117.31
--   diarios, $3,566.22 mensuales (INEGI, comunicado 1/26, vigente desde el 1/2/2026). Se actualiza
--   cada año en `parametros_globales`.
-- - Valores iniciales propuestos (los ajusta el oficial de cumplimiento desde el admin):
--   · Volumen anormal: alerta desde $200,000 por operación, bloqueo arriba de $2,000,000.
--   · Depósito de empresa: alerta arriba de $1,000,000.
--   · Depósitos del mes: alerta arriba de $10,000,000; desde un mismo origen, $3,000,000.
--   · En UMAs: alerta por depósito ≥ 100 UMAs (~$356,600) y por mes ≥ 1,000 UMAs (~$3.57 M).
--   · Bloqueo por acumulado mensual: persona física 24 UMAs (~$85,600, en línea con el tope de
--     10,000 UDIS de una cuenta nivel 3 de Banxico); persona moral 3,000 UMAs (~$10.7 M).
--   · Frecuencia: 30 transferencias por hora; 10 al mismo destino en 60 minutos.
--   · Horario habitual: 06:00 a 23:00 todos los días.
-- Aditiva.

alter table public.alert_rules
  add column if not exists parametros_pais jsonb not null default '{}'::jsonb;

insert into public.parametros_globales (clave, valor, descripcion) values
  ('uma_mensual_mx', '3566.22', 'UMA mensual de México (INEGI; 2026). Unidad de las reglas de prevención en MX.'),
  ('uma_diaria_mx', '117.31', 'UMA diaria de México (INEGI; 2026).')
on conflict (clave) do nothing;

-- Valida también los valores por país (mismas reglas que los generales).
create or replace function public.tg_alert_rules_validar()
returns trigger
language plpgsql
set search_path to ''
as $$
DECLARE
    v_pais text;
BEGIN
    PERFORM public.validar_parametros_alert_rule(NEW.code, NEW.parameters);
    FOR v_pais IN SELECT jsonb_object_keys(coalesce(NEW.parametros_pais, '{}'::jsonb)) LOOP
        IF v_pais !~ '^[A-Z]{2}$' THEN
            RAISE EXCEPTION 'Código de país inválido en la regla %: %', NEW.code, v_pais;
        END IF;
        IF NEW.parametros_pais -> v_pais ? 'parameters' THEN
            PERFORM public.validar_parametros_alert_rule(NEW.code, NEW.parametros_pais -> v_pais -> 'parameters');
        END IF;
    END LOOP;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- Guardar: con `pais` en el ítem se guardan los valores de ese país; sin `pais`, los generales.
create or replace function public.guardar_alert_rules(p_rules jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
DECLARE
    r jsonb;
    n integer := 0;
    v_pais text;
BEGIN
    IF NOT public.es_backoffice() THEN
        RAISE EXCEPTION 'Sin permiso para modificar la configuracion de alertas' USING errcode = '42501';
    END IF;
    IF jsonb_typeof(p_rules) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Se esperaba una lista de reglas';
    END IF;

    FOR r IN SELECT * FROM jsonb_array_elements(p_rules) LOOP
        v_pais := nullif(upper(r ->> 'pais'), '');
        IF v_pais IS NULL THEN
            UPDATE public.alert_rules
               SET is_enabled = coalesce((r ->> 'is_enabled')::boolean, is_enabled),
                   parameters = coalesce(r -> 'parameters', parameters),
                   updated_by = auth.uid()
             WHERE code = r ->> 'code';
        ELSE
            UPDATE public.alert_rules
               SET parametros_pais = jsonb_set(
                       coalesce(parametros_pais, '{}'::jsonb), ARRAY[v_pais],
                       jsonb_build_object(
                         'is_enabled', coalesce((r ->> 'is_enabled')::boolean,
                                                (parametros_pais -> v_pais ->> 'is_enabled')::boolean, is_enabled),
                         'parameters', coalesce(r -> 'parameters', parametros_pais -> v_pais -> 'parameters', parameters))),
                   updated_by = auth.uid()
             WHERE code = r ->> 'code';
        END IF;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Regla desconocida: %', r ->> 'code';
        END IF;
        n := n + 1;
    END LOOP;
    RETURN n;
END;
$$;

-- Valores iniciales de México (solo si todavía no se cargaron).
update public.alert_rules a
   set parametros_pais = a.parametros_pais || jsonb_build_object('MX', v.cfg)
  from (values
    ('abnormal_volume',            '{"is_enabled": true, "parameters": {"min_amount": 200000, "max_amount": 2000000}}'::jsonb),
    ('deposit_company_max',        '{"is_enabled": true, "parameters": {"max_amount": 1000000}}'::jsonb),
    ('deposit_monthly_limit',      '{"is_enabled": true, "parameters": {"monthly_amount": 10000000, "same_origin_monthly_amount": 3000000}}'::jsonb),
    ('deposit_min_wages',          '{"is_enabled": true, "parameters": {"min_wages_count": 1000, "min_wage_deposits_per_transfer": 100}}'::jsonb),
    ('deposit_min_wages_block',    '{"is_enabled": true, "parameters": {"company_min_wages": 3000, "individual_min_wages": 24}}'::jsonb),
    ('transfers_per_hour',         '{"is_enabled": true, "parameters": {"max_per_hour": 30}}'::jsonb),
    ('repeated_transfers',         '{"is_enabled": true, "parameters": {"threshold": 10, "window_minutes": 60}}'::jsonb),
    ('unusual_hours',              '{"is_enabled": true, "parameters": {"days": [
        {"day": 1, "enabled": true, "start": "06:00", "end": "23:00"},
        {"day": 2, "enabled": true, "start": "06:00", "end": "23:00"},
        {"day": 3, "enabled": true, "start": "06:00", "end": "23:00"},
        {"day": 4, "enabled": true, "start": "06:00", "end": "23:00"},
        {"day": 5, "enabled": true, "start": "06:00", "end": "23:00"},
        {"day": 6, "enabled": true, "start": "06:00", "end": "23:00"},
        {"day": 7, "enabled": true, "start": "06:00", "end": "23:00"}]}}'::jsonb)
  ) as v(code, cfg)
 where a.code = v.code and not (a.parametros_pais ? 'MX');

-- Motor: valores y unidad de referencia por pais del cliente.
CREATE OR REPLACE FUNCTION public.evaluar_reglas_operacion(p_transaction_id uuid, p_operacion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    c_tz     text := 'America/Argentina/Buenos_Aires';
    v_pais   text;
    v_unidad text := 'salarios minimos';
    v_zona   text := 'hora Argentina';
    t        record;
    cli      record;
    r        record;
    dest     record;
    v_local  timestamp;
    v_mes    text;
    v_ini    timestamptz;
    v_epoch  bigint;
    v_monto  numeric;
    v_smvm   numeric;
    v_n      bigint;
    v_sum    numeric;
    v_umbral numeric;
    v_origen text;
    v_alert  uuid;
    v_menor  boolean;
    v_dia    jsonb;
    v_hora   text;
    v_alertas uuid[] := ARRAY[]::uuid[];
    v_bloquea boolean := false;
    v_block_rule uuid;
    v_block_alert uuid;
    v_block_reason text;
BEGIN
    IF p_operacion NOT IN ('withdrawal', 'deposit') THEN
        RAISE EXCEPTION 'Operacion no soportada por el motor: %', p_operacion;
    END IF;

    SELECT id, cliente_id, legajo, tipo, cvu, monto_operacion, destinatario_cuit, subcuenta_id,
           coalesce(fecha, created_at) AS fecha
      INTO t FROM public.transactions WHERE id = p_transaction_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaccion % no encontrada', p_transaction_id;
    END IF;
    SELECT id, legajo, tipo_persona, fecha_nacimiento, pais INTO cli FROM public.clientes WHERE id = t.cliente_id;
    v_pais := coalesce(cli.pais, 'AR');
    -- Mexico: hora del centro y montos de referencia en UMA mensual (en lugar del SMVM argentino).
    IF v_pais = 'MX' THEN
        c_tz := 'America/Mexico_City';
        v_unidad := 'UMAs mensuales';
        v_zona := 'hora del centro de Mexico';
    END IF;

    PERFORM public._lock_cliente_reglas(cli.id);

    v_monto := t.monto_operacion;
    v_local := t.fecha AT TIME ZONE c_tz;
    v_mes   := to_char(v_local, 'YYYY-MM');
    v_ini   := date_trunc('month', v_local) AT TIME ZONE c_tz;
    v_epoch := extract(epoch FROM t.fecha)::bigint;
    v_smvm  := CASE WHEN v_pais = 'MX' THEN public.leer_parametro_numerico('uma_mensual_mx', 0)
                    ELSE public.leer_parametro_numerico('smvm_monto', 0) END;
    v_menor := cli.tipo_persona = 'fisica' AND cli.fecha_nacimiento IS NOT NULL
               AND cli.fecha_nacimiento > (current_date - interval '18 years');

    -- Contraparte cliente de MoliPay (por CVU), si la hay.
    SELECT c.id, c.tipo_persona, c.fecha_nacimiento INTO dest
      FROM public.subaccounts s JOIN public.clientes c ON c.legajo = s.cliente_legajo
     WHERE s.cbu = t.cvu AND c.id <> cli.id
     ORDER BY s.created_at LIMIT 1;

    FOR r IN SELECT a.id, a.code, a.name, a.action,
                    coalesce(a.parametros_pais -> v_pais -> 'parameters', a.parameters) AS parameters
               FROM public.alert_rules a
              WHERE coalesce((a.parametros_pais -> v_pais ->> 'is_enabled')::boolean, a.is_enabled)
              ORDER BY a.sort_order LOOP
        v_alert := NULL;

        -- ---------------------------------------------------------------- comunes
        IF r.code = 'abnormal_volume' THEN
            IF v_monto > (r.parameters ->> 'max_amount')::numeric THEN
                v_alert := public._registrar_alerta(cli.id, r.id, r.name, t.id,
                    format('Operacion de %s por $ %s: supera el maximo por operacion ($ %s).',
                           CASE p_operacion WHEN 'deposit' THEN 'deposito' ELSE 'retiro' END,
                           v_monto, r.parameters ->> 'max_amount'),
                    jsonb_build_object('monto', v_monto, 'maximo', (r.parameters ->> 'max_amount')::numeric),
                    r.code || ':' || t.id);
                v_bloquea := true; v_block_rule := r.id; v_block_alert := v_alert;
                v_block_reason := 'Volumen anormal: monto por encima del maximo por operacion';
            ELSIF v_monto >= (r.parameters ->> 'min_amount')::numeric THEN
                v_alert := public._registrar_alerta(cli.id, r.id, r.name, t.id,
                    format('Operacion por $ %s: alcanza el umbral de volumen anormal ($ %s).', v_monto, r.parameters ->> 'min_amount'),
                    jsonb_build_object('monto', v_monto, 'minimo', (r.parameters ->> 'min_amount')::numeric),
                    r.code || ':' || t.id);
            END IF;

        ELSIF r.code = 'minors_transfer_policy' THEN
            IF (r.parameters ->> 'policy') <> 'allow'
               AND (v_menor OR (dest.id IS NOT NULL AND dest.tipo_persona = 'fisica' AND dest.fecha_nacimiento IS NOT NULL
                                AND dest.fecha_nacimiento > (current_date - interval '18 years'))) THEN
                v_alert := public._registrar_alerta(cli.id, r.id, r.name, t.id,
                    CASE WHEN v_menor THEN 'El cliente es menor de edad.' ELSE 'La contraparte (cliente MoliPay) es menor de edad.' END,
                    jsonb_build_object('politica', r.parameters ->> 'policy', 'cliente_menor', v_menor),
                    r.code || ':' || t.id);
                IF (r.parameters ->> 'policy') = 'block' THEN
                    v_bloquea := true; v_block_rule := r.id; v_block_alert := v_alert;
                    v_block_reason := 'Operacion que involucra a un menor de edad';
                END IF;
            END IF;

        ELSIF r.code = 'unusual_hours' THEN
            SELECT d INTO v_dia FROM jsonb_array_elements(r.parameters -> 'days') d
             WHERE (d ->> 'day')::int = extract(isodow FROM v_local)::int;
            v_hora := to_char(v_local, 'HH24:MI');
            -- Dia sin franja habilitada, o fuera de la franja -> horario inusual.
            IF v_dia IS NULL OR NOT (v_dia ->> 'enabled')::boolean
               OR v_hora < (v_dia ->> 'start') OR v_hora >= (v_dia ->> 'end') THEN
                v_alert := public._registrar_alerta(cli.id, r.id, r.name, t.id,
                    format('Movimiento el %s a las %s (%s), fuera de la franja habilitada.',
                           to_char(v_local, 'DD/MM/YYYY'), v_hora, v_zona),
                    jsonb_build_object('dia', extract(isodow FROM v_local), 'hora', v_hora),
                    r.code || ':' || t.id);
            END IF;

        -- ---------------------------------------------------------------- retiros
        ELSIF p_operacion = 'withdrawal' AND r.code = 'transfers_per_hour' THEN
            SELECT count(*) + 1 INTO v_n FROM public.transactions x
             WHERE x.cliente_id = cli.id AND x.tipo = 'transferencia' AND x.id <> t.id
               AND x.id_txn !~ '^INT-' AND x.ledger_status IN ('reserved', 'posted')
               AND x.created_at > t.fecha - interval '1 hour';
            IF v_n > (r.parameters ->> 'max_per_hour')::numeric THEN
                v_alert := public._registrar_alerta(cli.id, r.id, r.name, t.id,
                    format('%s transferencias en la ultima hora (limite %s).', v_n, r.parameters ->> 'max_per_hour'),
                    jsonb_build_object('cantidad', v_n, 'limite', (r.parameters ->> 'max_per_hour')::numeric),
                    r.code || ':' || cli.id || ':' || to_char(v_local, 'YYYY-MM-DD HH24'));
            END IF;

        ELSIF p_operacion = 'withdrawal' AND r.code = 'repeated_transfers' THEN
            SELECT count(*) + 1 INTO v_n FROM public.transactions x
             WHERE x.cliente_id = cli.id AND x.tipo = 'transferencia' AND x.id <> t.id
               AND x.cvu = t.cvu AND x.ledger_status IN ('reserved', 'posted')
               AND x.created_at > t.fecha - make_interval(mins => (r.parameters ->> 'window_minutes')::int);
            IF v_n >= (r.parameters ->> 'threshold')::numeric THEN
                v_alert := public._registrar_alerta(cli.id, r.id, r.name, t.id,
                    format('%s transferencias al mismo destino (%s) en %s minutos (umbral %s).',
                           v_n, t.cvu, r.parameters ->> 'window_minutes', r.parameters ->> 'threshold'),
                    jsonb_build_object('cantidad', v_n, 'destino', t.cvu),
                    r.code || ':' || cli.id || ':' || t.cvu || ':' ||
                        (v_epoch / ((r.parameters ->> 'window_minutes')::bigint * 60)));
            END IF;

        ELSIF p_operacion = 'withdrawal' AND r.code = 'company_account_affinity' THEN
            IF cli.tipo_persona = 'juridica' AND dest.id IS NOT NULL AND dest.tipo_persona = 'juridica' THEN
                SELECT count(*) + 1 INTO v_n FROM public.transactions x
                 WHERE x.cliente_id = cli.id AND x.tipo = 'transferencia' AND x.id <> t.id
                   AND x.ledger_status IN ('reserved', 'posted')
                   AND x.cvu IN (SELECT s.cbu FROM public.subaccounts s JOIN public.clientes c ON c.legajo = s.cliente_legajo
                                  WHERE c.id = dest.id AND s.cbu IS NOT NULL)
                   AND x.created_at > t.fecha - make_interval(days => (r.parameters ->> 'window_days')::int);
                IF v_n >= (r.parameters ->> 'threshold')::numeric THEN
                    v_alert := public._registrar_alerta(cli.id, r.id, r.name, t.id,
                        format('%s transferencias entre las mismas empresas en %s dias (umbral %s).',
                               v_n, r.parameters ->> 'window_days', r.parameters ->> 'threshold'),
                        jsonb_build_object('cantidad', v_n, 'empresa_destino', dest.id),
                        r.code || ':' || cli.id || ':' || dest.id || ':' ||
                            (v_epoch / ((r.parameters ->> 'window_days')::bigint * 86400)));
                END IF;
            END IF;

        -- ---------------------------------------------------------------- depositos
        ELSIF p_operacion = 'deposit' AND r.code = 'deposit_company_max' THEN
            IF cli.tipo_persona = 'juridica' AND v_monto > (r.parameters ->> 'max_amount')::numeric THEN
                v_alert := public._registrar_alerta(cli.id, r.id, r.name, t.id,
                    format('Deposito de $ %s a una empresa: supera el maximo por deposito ($ %s).', v_monto, r.parameters ->> 'max_amount'),
                    jsonb_build_object('monto', v_monto, 'maximo', (r.parameters ->> 'max_amount')::numeric),
                    r.code || ':' || t.id);
            END IF;

        ELSIF p_operacion = 'deposit' AND r.code IN ('deposit_monthly_limit', 'deposit_min_wages', 'deposit_min_wages_block') THEN
            -- Acumulado del mes calendario (hora Argentina), incluido este deposito.
            SELECT coalesce(sum(x.monto_operacion), 0) + v_monto INTO v_sum FROM public.transactions x
             WHERE x.cliente_id = cli.id AND x.tipo = 'deposito' AND x.id <> t.id
               AND x.ledger_status = 'posted' AND x.fecha >= v_ini;

            IF r.code = 'deposit_monthly_limit' THEN
                IF v_sum > (r.parameters ->> 'monthly_amount')::numeric THEN
                    v_alert := public._registrar_alerta(cli.id, r.id, r.name, t.id,
                        format('Depositos del mes %s: $ %s, superan el limite mensual ($ %s).', v_mes, v_sum, r.parameters ->> 'monthly_amount'),
                        jsonb_build_object('acumulado', v_sum, 'limite', (r.parameters ->> 'monthly_amount')::numeric, 'mes', v_mes),
                        r.code || ':' || cli.id || ':' || v_mes);
                    v_alertas := v_alertas || v_alert;
                END IF;
                -- Mismo origen: CUIT del depositante (o su CBU si no vino el CUIT).
                v_origen := coalesce(nullif(t.destinatario_cuit, ''), t.cvu);
                IF v_origen IS NOT NULL THEN
                    SELECT coalesce(sum(x.monto_operacion), 0) + v_monto INTO v_sum FROM public.transactions x
                     WHERE x.cliente_id = cli.id AND x.tipo = 'deposito' AND x.id <> t.id
                       AND x.ledger_status = 'posted' AND x.fecha >= v_ini
                       AND coalesce(nullif(x.destinatario_cuit, ''), x.cvu) = v_origen;
                    IF v_sum > (r.parameters ->> 'same_origin_monthly_amount')::numeric THEN
                        v_alert := public._registrar_alerta(cli.id, r.id, r.name, t.id,
                            format('Depositos del mes %s desde un mismo origen (%s): $ %s, superan $ %s.',
                                   v_mes, v_origen, v_sum, r.parameters ->> 'same_origin_monthly_amount'),
                            jsonb_build_object('acumulado', v_sum, 'origen', v_origen, 'mes', v_mes),
                            r.code || ':origen:' || cli.id || ':' || v_origen || ':' || v_mes);
                    ELSE
                        v_alert := NULL;
                    END IF;
                END IF;

            ELSIF r.code = 'deposit_min_wages' AND v_smvm > 0 THEN
                IF v_monto >= (r.parameters ->> 'min_wage_deposits_per_transfer')::numeric * v_smvm THEN
                    v_alert := public._registrar_alerta(cli.id, r.id, r.name, t.id,
                        format('Deposito de $ %s: equivale a %s %s (umbral por transferencia %s).',
                               v_monto, round(v_monto / v_smvm, 2), v_unidad, r.parameters ->> 'min_wage_deposits_per_transfer'),
                        jsonb_build_object('monto', v_monto, 'smvm', v_smvm),
                        r.code || ':op:' || t.id);
                    v_alertas := v_alertas || v_alert;
                END IF;
                IF v_sum >= (r.parameters ->> 'min_wages_count')::numeric * v_smvm THEN
                    v_alert := public._registrar_alerta(cli.id, r.id, r.name, t.id,
                        format('Depositos del mes %s: %s %s (umbral %s).',
                               v_mes, round(v_sum / v_smvm, 2), v_unidad, r.parameters ->> 'min_wages_count'),
                        jsonb_build_object('acumulado', v_sum, 'smvm', v_smvm, 'mes', v_mes),
                        r.code || ':mes:' || cli.id || ':' || v_mes);
                ELSE
                    v_alert := NULL;
                END IF;

            ELSIF r.code = 'deposit_min_wages_block' AND v_smvm > 0 THEN
                -- Umbral individual del cliente si tiene uno; si no, el general.
                SELECT CASE WHEN cli.tipo_persona = 'juridica'
                            THEN coalesce(p.company_min_wages, (r.parameters ->> 'company_min_wages')::numeric)
                            ELSE coalesce(p.individual_min_wages, (r.parameters ->> 'individual_min_wages')::numeric) END
                  INTO v_umbral
                  FROM (SELECT 1) one
                  LEFT JOIN public.client_block_parameters p ON p.client_id = cli.id;
                IF v_umbral > 0 AND v_sum >= v_umbral * v_smvm THEN
                    v_alert := public._registrar_alerta(cli.id, r.id, r.name, t.id,
                        format('Depositos del mes %s: %s %s, alcanza el umbral de bloqueo (%s).',
                               v_mes, round(v_sum / v_smvm, 2), v_unidad, v_umbral),
                        jsonb_build_object('acumulado', v_sum, 'smvm', v_smvm, 'umbral', v_umbral, 'mes', v_mes),
                        r.code || ':' || cli.id || ':' || v_mes);
                    v_bloquea := true; v_block_rule := r.id; v_block_alert := v_alert;
                    v_block_reason := 'Depositos del mes por encima del umbral de salarios minimos';
                END IF;
            END IF;
        END IF;

        -- Una regla configurada con action = block bloquea siempre que dispare.
        IF v_alert IS NOT NULL THEN
            v_alertas := v_alertas || v_alert;
            IF r.action = 'block' AND NOT v_bloquea THEN
                v_bloquea := true; v_block_rule := r.id; v_block_alert := v_alert;
                v_block_reason := r.name;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'decision', CASE WHEN v_bloquea THEN 'block' WHEN cardinality(v_alertas) > 0 THEN 'alert' ELSE 'allow' END,
        'alert_ids', to_jsonb(ARRAY(SELECT DISTINCT unnest(v_alertas))),
        'block_rule_id', v_block_rule,
        'block_alert_id', v_block_alert,
        'block_reason', v_block_reason
    );
END;
$function$;
