-- Alertas de enlaces de pago (reunión con JPay, 3/11/2026): "a partir de unos 25-30 mil pesos en
-- un link de pago ya meteríamos alertas", y control de la cantidad de links. JPay decide qué hacer
-- (gestionar la alerta o bloquear a mano desde el admin).
--
-- - payment_link_amount: alerta cuando un cobro por link de pago (Ecart Pay) se paga por un monto
--   igual o mayor al parámetro. México: $25,000.
-- - payment_links_per_day: alerta cuando un comercio crea más links en el día (hora del país) que
--   el parámetro. México: 20.
-- Los dos se configuran por país en Alertas → Parámetros de alertas. Argentina los tiene apagados.
-- Aditiva.

CREATE OR REPLACE FUNCTION public.validar_parametros_alert_rule(p_code text, p_params jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
    k   text;
    d   jsonb;
    req text[];
    ent text[];
BEGIN
    CASE p_code
        WHEN 'deposit_company_max'        THEN req := ARRAY['max_amount'];
        WHEN 'deposit_min_wages'          THEN req := ARRAY['min_wages_count', 'min_wage_deposits_per_transfer']; ent := req;
        WHEN 'deposit_monthly_limit'      THEN req := ARRAY['monthly_amount', 'same_origin_monthly_amount'];
        WHEN 'withdrawal_failed_attempts' THEN req := ARRAY['max_attempts', 'window_seconds']; ent := req;
        WHEN 'repeated_transfers'         THEN req := ARRAY['threshold', 'window_minutes']; ent := req;
        WHEN 'transfers_per_hour'         THEN req := ARRAY['max_per_hour']; ent := req;
        WHEN 'company_account_affinity'   THEN req := ARRAY['threshold', 'window_days']; ent := req;
        WHEN 'abnormal_volume'            THEN req := ARRAY['min_amount', 'max_amount'];
        WHEN 'deposit_min_wages_block'    THEN req := ARRAY['individual_min_wages', 'company_min_wages']; ent := req;
        WHEN 'plaft_screening'            THEN req := ARRAY['threshold'];
        WHEN 'payment_link_amount'        THEN req := ARRAY['min_amount'];
        WHEN 'payment_links_per_day'      THEN req := ARRAY['max_per_day']; ent := req;
        WHEN 'minors_transfer_policy', 'unusual_hours' THEN req := ARRAY[]::text[];
        ELSE RAISE EXCEPTION 'Regla desconocida: %', p_code;
    END CASE;

    FOREACH k IN ARRAY req LOOP
        IF jsonb_typeof(p_params -> k) IS DISTINCT FROM 'number' THEN
            RAISE EXCEPTION 'El parametro "%" de la regla % debe ser numerico', k, p_code;
        END IF;
        IF (p_params ->> k)::numeric < 0 THEN
            RAISE EXCEPTION 'El parametro "%" de la regla % no puede ser negativo', k, p_code;
        END IF;
        IF k = ANY (coalesce(ent, ARRAY[]::text[])) AND (p_params ->> k)::numeric <> trunc((p_params ->> k)::numeric) THEN
            RAISE EXCEPTION 'El parametro "%" de la regla % debe ser un numero entero', k, p_code;
        END IF;
    END LOOP;

    IF p_code = 'abnormal_volume' AND (p_params ->> 'min_amount')::numeric > (p_params ->> 'max_amount')::numeric THEN
        RAISE EXCEPTION 'Volumen anormal: el monto minimo no puede superar al maximo';
    END IF;
    IF p_code = 'withdrawal_failed_attempts' AND (p_params ->> 'window_seconds')::numeric = 0 THEN
        RAISE EXCEPTION 'El tiempo de evaluacion de retiros fallidos debe ser mayor a 0';
    END IF;
    IF p_code = 'repeated_transfers' AND (p_params ->> 'window_minutes')::numeric = 0 THEN
        RAISE EXCEPTION 'La ventana de transferencias repetidas debe ser mayor a 0';
    END IF;
    IF p_code = 'company_account_affinity' AND (p_params ->> 'window_days')::numeric = 0 THEN
        RAISE EXCEPTION 'La ventana de afinidad debe ser mayor a 0';
    END IF;
    IF p_code = 'plaft_screening' AND (p_params ->> 'threshold')::numeric > 100 THEN
        RAISE EXCEPTION 'El umbral de coincidencia PLAFT va de 0 a 100';
    END IF;

    IF p_code = 'minors_transfer_policy'
       AND coalesce(p_params ->> 'policy', '') NOT IN ('allow', 'alert', 'block') THEN
        RAISE EXCEPTION 'Politica de transferencias a menores invalida: %', p_params ->> 'policy';
    END IF;

    IF p_code = 'unusual_hours' THEN
        IF jsonb_typeof(p_params -> 'days') IS DISTINCT FROM 'array' OR jsonb_array_length(p_params -> 'days') <> 7 THEN
            RAISE EXCEPTION 'Horario inusual: se esperan los 7 dias de la semana';
        END IF;
        FOR d IN SELECT * FROM jsonb_array_elements(p_params -> 'days') LOOP
            IF (d ->> 'day')::int NOT BETWEEN 1 AND 7 OR jsonb_typeof(d -> 'enabled') IS DISTINCT FROM 'boolean' THEN
                RAISE EXCEPTION 'Horario inusual: dia invalido %', d;
            END IF;
            IF coalesce(d ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
               OR coalesce(d ->> 'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
                RAISE EXCEPTION 'Horario inusual: hora invalida en el dia %', d ->> 'day';
            END IF;
            IF (d ->> 'enabled')::boolean AND (d ->> 'start') >= (d ->> 'end') THEN
                RAISE EXCEPTION 'Horario inusual: en el dia % la hora de inicio debe ser anterior a la de fin', d ->> 'day';
            END IF;
        END LOOP;
        IF (SELECT count(DISTINCT (x ->> 'day')) FROM jsonb_array_elements(p_params -> 'days') x) <> 7 THEN
            RAISE EXCEPTION 'Horario inusual: hay dias repetidos';
        END IF;
    END IF;
END;
$function$;

insert into public.alert_rules (code, name, category, description, action, parameters, is_enabled, sort_order, parametros_pais)
values
  ('payment_link_amount', 'Cobro alto por link de pago', 'amounts',
   'Un cobro por link de pago igual o mayor al monto configurado.', 'alert',
   '{"min_amount": 25000}', false, 110,
   '{"MX": {"is_enabled": true, "parameters": {"min_amount": 25000}}}'),
  ('payment_links_per_day', 'Muchos links de pago en el día', 'frequency',
   'Un comercio crea más links de pago en el día que el máximo configurado.', 'alert',
   '{"max_per_day": 20}', false, 115,
   '{"MX": {"is_enabled": true, "parameters": {"max_per_day": 20}}}')
on conflict (code) do nothing;

-- Regla vigente para el país del cliente: (activa, parámetros, id, nombre).
create or replace function public._regla_de_pais(p_code text, p_pais text)
returns table (activa boolean, parametros jsonb, regla_id uuid, nombre text)
language sql
stable
set search_path to ''
as $$
  select coalesce((a.parametros_pais -> p_pais ->> 'is_enabled')::boolean, a.is_enabled),
         coalesce(a.parametros_pais -> p_pais -> 'parameters', a.parameters), a.id, a.name
    from public.alert_rules a where a.code = p_code;
$$;

-- Cobro por link pagado: alerta si supera el monto.
create or replace function public.tg_alerta_cobro_link()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_cli record;
  r record;
begin
  if new.estado <> 'pagado' or coalesce(old.estado, '') = 'pagado' then
    return new;
  end if;
  select id, coalesce(pais, 'AR') pais into v_cli from public.clientes where legajo = new.cliente_legajo;
  if v_cli.id is null then
    return new;
  end if;
  select * into r from public._regla_de_pais('payment_link_amount', v_cli.pais);
  if r.activa and new.monto >= (r.parametros ->> 'min_amount')::numeric then
    perform public._registrar_alerta(
      v_cli.id, r.regla_id, r.nombre, null,
      format('Cobro por link de pago de $ %s (umbral $ %s).', new.monto, r.parametros ->> 'min_amount'),
      jsonb_build_object('pago_id', new.id, 'monto', new.monto, 'metodo', new.metodo,
                         'umbral', (r.parametros ->> 'min_amount')::numeric),
      'payment_link_amount:' || new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists alerta_cobro_link on public.pagos;
create trigger alerta_cobro_link after insert or update of estado on public.pagos
  for each row execute function public.tg_alerta_cobro_link();

-- Link creado: alerta si el comercio supera el máximo de links del día.
create or replace function public.tg_alerta_links_por_dia()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_cli record;
  r record;
  v_tz text;
  v_dia date;
  n int;
begin
  select id, coalesce(pais, 'AR') pais into v_cli from public.clientes where legajo = new.cliente_legajo;
  if v_cli.id is null then
    return new;
  end if;
  select * into r from public._regla_de_pais('payment_links_per_day', v_cli.pais);
  if not coalesce(r.activa, false) then
    return new;
  end if;
  select timezone into v_tz from public.paises where codigo = v_cli.pais;
  v_tz := coalesce(v_tz, 'America/Mexico_City');
  v_dia := (now() at time zone v_tz)::date;
  select count(*) into n from public.cliente_links_pago
   where cliente_legajo = new.cliente_legajo
     and (created_at at time zone v_tz)::date = v_dia;
  if n > (r.parametros ->> 'max_per_day')::int then
    perform public._registrar_alerta(
      v_cli.id, r.regla_id, r.nombre, null,
      format('%s links de pago creados el %s (máximo %s).', n, to_char(v_dia, 'DD/MM/YYYY'), r.parametros ->> 'max_per_day'),
      jsonb_build_object('cantidad', n, 'dia', v_dia, 'maximo', (r.parametros ->> 'max_per_day')::int),
      'payment_links_per_day:' || new.cliente_legajo || ':' || v_dia);
  end if;
  return new;
end;
$$;

drop trigger if exists alerta_links_por_dia on public.cliente_links_pago;
create trigger alerta_links_por_dia after insert on public.cliente_links_pago
  for each row execute function public.tg_alerta_links_por_dia();
