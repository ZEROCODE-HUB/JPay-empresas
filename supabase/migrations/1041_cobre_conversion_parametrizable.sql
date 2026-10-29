-- Conversiones MXN → USD parametrizables.
--
-- - Comisión de JPay: nuevo tipo `Conversión` en `comisiones_cliente` (porcentaje o fijo + IVA,
--   por cliente o por subcuenta de pesos, como Depósito y Retiro). Se calcula al cotizar, se guarda
--   en la conversión (es lo que ve el comercio) y se reserva junto con el monto. Sin comisión
--   configurada no se cobra nada (igual que hasta ahora).
-- - Reglas de prevención: `cobre_configuracion.conversion_evalua_reglas` (apagado por defecto). Si
--   está prendido, la conversión se evalúa como un retiro antes de reservar y una regla que bloquea
--   la rechaza.
-- - Al completarse, la comisión va a INGRESOS_COMISIONES_MXN y el IVA a IVA_DEBITO_FISCAL_MXN; los
--   pesos de la comisión quedan en el Balance del comercio, por eso el saldo esperado del Balance
--   los suma (como en los envíos SPEI).
-- Aditiva.

alter table public.comisiones_cliente drop constraint if exists comisiones_cliente_tipo_check;
alter table public.comisiones_cliente add constraint comisiones_cliente_tipo_check
  check (tipo in ('Depósito', 'Retiro', 'Link de pago', 'E-commerce', 'Conversión'));
alter table public.comisiones_cliente drop constraint if exists comisiones_cliente_cvu_tipo_check;
alter table public.comisiones_cliente add constraint comisiones_cliente_cvu_tipo_check
  check (subcuenta_id is null or tipo in ('Retiro', 'Depósito', 'Conversión'));

alter table public.cobre_configuracion
  add column if not exists conversion_evalua_reglas boolean not null default false;

alter table public.cobre_cruces
  add column if not exists comision numeric(14, 2) not null default 0 check (comision >= 0),
  add column if not exists impuesto numeric(14, 2) not null default 0 check (impuesto >= 0);

create or replace function public.calcular_comision(
  p_cliente_id uuid,
  p_monto numeric,
  p_subcuenta_id uuid default null,
  p_tipo text default 'Retiro',
  p_destino text default null
)
returns table(comision numeric, impuesto numeric)
language plpgsql
stable
security definer
set search_path to ''
as $$
DECLARE
    k        record;
    v_com    numeric := 0;
BEGIN
    IF p_tipo NOT IN ('Retiro', 'Depósito', 'Conversión') THEN
        RAISE EXCEPTION 'Tipo de comision no soportado: %', p_tipo;
    END IF;
    IF p_tipo = 'Retiro' AND public._es_transferencia_interna(p_cliente_id, p_destino) THEN
        RETURN QUERY SELECT 0::numeric, 0::numeric;
        RETURN;
    END IF;

    SELECT * INTO k FROM public._comision_aplicable(p_cliente_id, p_subcuenta_id, p_tipo);
    IF FOUND THEN
        IF k.modalidad = 'Fijo' THEN
            v_com := coalesce(k.monto_fijo, 0);
        ELSIF coalesce(k.porcentaje, 0) > 0 THEN
            v_com := round(p_monto * k.porcentaje / 100, 2);
        END IF;
    END IF;
    v_com := greatest(coalesce(v_com, 0), 0);

    RETURN QUERY SELECT v_com, round(v_com * coalesce(k.porcentaje_impuesto, 21) / 100, 2);
END;
$$;

-- Comisión de JPay de una conversión (la usa `cobre-fx` al cotizar).
create or replace function public.cobre_comision_cruce(p_legajo text, p_subcuenta_id uuid, p_monto numeric)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object('comision', coalesce(k.comision, 0), 'impuesto', coalesce(k.impuesto, 0))
    from public.clientes c
    left join lateral public.calcular_comision(c.id, p_monto, p_subcuenta_id, 'Conversión') k on true
   where c.legajo = p_legajo;
$$;
revoke all on function public.cobre_comision_cruce(text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.cobre_comision_cruce(text, uuid, numeric) to service_role;

-- Reserva: monto + comisión + IVA; reglas de prevención si están prendidas para conversiones.
create or replace function public.cobre_reservar_cruce(p_cruce_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_c public.cobre_cruces;
  v_cliente_id uuid;
  v_tx_id uuid;
  v_disp numeric;
  v_total numeric;
  v_eval jsonb;
  v_rech jsonb;
begin
  select * into v_c from public.cobre_cruces where id = p_cruce_id for update;
  if not found then
    raise exception 'Conversión % inexistente', p_cruce_id;
  end if;
  if v_c.transaction_mxn_id is not null then
    return jsonb_build_object('ok', true, 'ya_reservada', true, 'transaction_id', v_c.transaction_mxn_id);
  end if;
  v_total := v_c.monto_mxn + v_c.comision + v_c.impuesto;
  select id into v_cliente_id from public.clientes where legajo = v_c.cliente_legajo;
  perform public._lock_cliente_reglas(v_cliente_id);
  if public._bloqueo_activo(v_cliente_id, v_c.subcuenta_mxn_id) is not null then
    return jsonb_build_object('ok', false, 'motivo', 'La cuenta tiene un bloqueo vigente');
  end if;
  select saldo_disponible into v_disp from public.subaccount_balances
   where subaccount_id = v_c.subcuenta_mxn_id for update;
  if coalesce(v_disp, 0) < v_total then
    return jsonb_build_object('ok', false, 'motivo',
      case when v_total > v_c.monto_mxn then 'Saldo insuficiente en pesos para el monto, la comisión y el IVA'
           else 'Saldo insuficiente en pesos' end);
  end if;

  insert into public.transactions (
    cliente_id, legajo, id_txn, tipo, cvu, subcuenta_id, destinatario_nombre,
    monto_operacion, comision, impuesto, monto_cobrado, estado_id
  ) values (
    v_cliente_id, v_c.cliente_legajo, v_c.external_id, 'conversion', 'COBRE-FX', v_c.subcuenta_mxn_id,
    'Conversión a dólares', v_c.monto_mxn, v_c.comision, v_c.impuesto, v_c.comision + v_c.impuesto,
    public._estado_movimiento_id('EN_PROGRESO')
  ) returning id into v_tx_id;

  if coalesce((select conversion_evalua_reglas from public.cobre_configuracion where id = 1), false) then
    v_eval := public.evaluar_reglas_operacion(v_tx_id, 'withdrawal');
    if v_eval ->> 'decision' = 'block' then
      v_rech := public._rechazar_retiro(v_tx_id, 'regla');
      return jsonb_build_object('ok', false, 'rechazada', true, 'motivo', v_rech ->> 'motivo');
    end if;
  end if;

  perform public.ledger_post(v_tx_id, 'reserva', public._ledger_lines(
    public._ledger_line(public._ledger_sub_account_id(v_c.subcuenta_mxn_id, 'disponible'), 'debit', v_total, 'reserva'),
    public._ledger_line(public._ledger_sub_account_id(v_c.subcuenta_mxn_id, 'retenido'), 'credit', v_total, 'reserva')
  ), 'reserved');
  update public.cobre_cruces set transaction_mxn_id = v_tx_id, updated_at = now() where id = p_cruce_id;
  return jsonb_build_object('ok', true, 'ya_reservada', false, 'transaction_id', v_tx_id);
end;
$$;

-- Completada: salen los pesos al Balance Global, la comisión y el IVA a las cuentas de JPay y entran
-- los dólares en la subcuenta USD del comercio.
create or replace function public.cobre_confirmar_cruce(p_cruce_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_c public.cobre_cruces;
  v_cliente_id uuid;
  v_usd_id uuid;
  v_tx record;
begin
  select * into v_c from public.cobre_cruces where id = p_cruce_id for update;
  if not found then
    raise exception 'Conversión % inexistente', p_cruce_id;
  end if;
  if v_c.transaction_usd_id is not null then
    return jsonb_build_object('ok', true, 'ya_registrada', true);
  end if;
  if v_c.transaction_mxn_id is null then
    raise exception 'La conversión % no tiene pesos reservados', p_cruce_id;
  end if;
  select ledger_status, comision, impuesto into v_tx
    from public.transactions where id = v_c.transaction_mxn_id for update;
  if v_tx.ledger_status <> 'reserved' then
    raise exception 'La conversión % no está reservada (estado contable %)', p_cruce_id, v_tx.ledger_status;
  end if;
  select id into v_cliente_id from public.clientes where legajo = v_c.cliente_legajo;

  perform public.ledger_post(v_c.transaction_mxn_id, 'conversion', public._ledger_lines(
    public._ledger_line(public._ledger_sub_account_id(v_c.subcuenta_mxn_id, 'retenido'), 'debit', v_c.monto_mxn),
    public._ledger_line(public._ledger_sub_account_id(v_c.subcuenta_mxn_id, 'retenido'), 'debit', v_tx.comision, 'comision'),
    public._ledger_line(public._ledger_sub_account_id(v_c.subcuenta_mxn_id, 'retenido'), 'debit', v_tx.impuesto, 'impuesto'),
    public._ledger_line(public._ledger_account_id('BANCO_COBRE'), 'credit', v_c.monto_mxn),
    public._ledger_line(public._cobre_cuenta('comision', 'MXN'), 'credit', v_tx.comision, 'comision'),
    public._ledger_line(public._cobre_cuenta('iva', 'MXN'), 'credit', v_tx.impuesto, 'impuesto')
  ), 'posted');
  update public.transactions set estado_id = public._estado_movimiento_id('APROBADO') where id = v_c.transaction_mxn_id;

  insert into public.transactions (
    cliente_id, legajo, id_txn, tipo, cvu, subcuenta_id, destinatario_nombre,
    monto_operacion, comision, impuesto, monto_cobrado, estado_id
  ) values (
    v_cliente_id, v_c.cliente_legajo, v_c.external_id || '-USD', 'conversion', 'COBRE-FX', v_c.subcuenta_usd_id,
    'Conversión desde pesos', v_c.monto_usd, 0, 0, 0, public._estado_movimiento_id('APROBADO')
  ) returning id into v_usd_id;
  perform public.ledger_post(v_usd_id, 'conversion', public._ledger_lines(
    public._ledger_line(public._ledger_account_id('BANCO_COBRE_USD'), 'debit', v_c.monto_usd),
    public._ledger_line(public._ledger_sub_account_id(v_c.subcuenta_usd_id, 'disponible'), 'credit', v_c.monto_usd)
  ), 'posted');

  update public.cobre_cruces set transaction_usd_id = v_usd_id, updated_at = now() where id = p_cruce_id;
  return jsonb_build_object('ok', true, 'ya_registrada', false, 'monto_usd', v_c.monto_usd);
end;
$$;

-- Saldo esperado del Balance del comercio: también quedan en él la comisión y el IVA de las
-- conversiones.
create or replace function public.cobre_saldo_esperado_comercio(p_legajo text)
returns numeric
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select sum(b.saldo_disponible + b.saldo_retenido)
      from public.subaccounts s join public.subaccount_balances b on b.subaccount_id = s.id
     where s.cliente_legajo = p_legajo and coalesce(s.moneda, 'MXN') = 'MXN'
       and exists (select 1 from public.ledger_accounts la where la.subaccount_id = s.id and la.currency_code = 'MXN')
  ), 0)
  + coalesce((
    select sum(t.comision + t.impuesto)
      from public.transactions t
     where t.legajo = p_legajo and t.ledger_status = 'posted' and t.currency_code = 'MXN'
       and (t.id_txn like 'COBRE-%'
            or t.id_txn in (select ct.id_txn from public.cobre_transferencias ct
                             where ct.cliente_legajo = p_legajo and ct.moneda = 'MXN')
            or t.id_txn in (select cc.external_id from public.cobre_cruces cc
                             where cc.cliente_legajo = p_legajo))
  ), 0);
$$;
