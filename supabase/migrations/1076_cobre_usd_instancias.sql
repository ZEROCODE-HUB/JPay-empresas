-- Dólares en la instancia Cobre propia de un comercio (Solution Design §4.1: los pasos 5–6 aplican
-- si el comercio contrata cruce y payouts USD en su instancia). 26/11/2026.
--
-- * Cada instancia puede tener sus Balances Global (`pr_global_cobre`) y USA (`pr_usa_cobre`):
--   filas `cobre_cuentas` tipo global/usa con `instancia_id` (las de JPay tienen instancia null).
-- * Esos dólares son del comercio, no de la bolsa de JPay: se contabilizan en
--   BANCO_COBRE_USD_PROPIAS, así la conciliación de Global + USA de JPay contra BANCO_COBRE_USD
--   no se mezcla. Cada instancia se concilia contra `cobre_saldo_esperado_usd_instancia`.
-- * `cobre_cruces.instancia_id`: de qué instancia es la conversión.
-- Aditiva (el índice único de Global/USA pasa a ser por instancia).

insert into public.ledger_accounts (account_code, name, account_type, currency_code, is_active)
select 'BANCO_COBRE_USD_PROPIAS', 'Cobre Balances Global y USA de cuentas propias de comercios',
       'asset', 'USD', true
where not exists (select 1 from public.ledger_accounts where account_code = 'BANCO_COBRE_USD_PROPIAS');

alter table public.cobre_cruces
  add column if not exists instancia_id uuid references public.cobre_instancias (id) on delete restrict;

drop index if exists public.cobre_cuentas_matriz_key;
create unique index if not exists cobre_cuentas_matriz_key on public.cobre_cuentas (modo, tipo)
  where tipo in ('global', 'usa') and estado = 'activa' and instancia_id is null;
create unique index if not exists cobre_cuentas_usd_instancia_key
  on public.cobre_cuentas (modo, tipo, instancia_id)
  where tipo in ('global', 'usa') and estado = 'activa' and instancia_id is not null;

-- Cuenta contable del banco USD: la bolsa de JPay o la de cuentas propias.
create or replace function public._cobre_banco_usd(p_instancia uuid)
returns uuid
language sql
stable
set search_path to ''
as $$
  select public._ledger_account_id(
    case when p_instancia is null then 'BANCO_COBRE_USD' else 'BANCO_COBRE_USD_PROPIAS' end);
$$;
revoke all on function public._cobre_banco_usd(uuid) from public, anon, authenticated;
grant execute on function public._cobre_banco_usd(uuid) to service_role;

create or replace function public.cobre_confirmar_cruce(p_cruce_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
  -- Los dólares entran a la bolsa de JPay o, en una instancia propia, a los Balances del comercio.
  perform public.ledger_post(v_usd_id, 'conversion', public._ledger_lines(
    public._ledger_line(public._cobre_banco_usd(v_c.instancia_id), 'debit', v_c.monto_usd),
    public._ledger_line(public._ledger_sub_account_id(v_c.subcuenta_usd_id, 'disponible'), 'credit', v_c.monto_usd)
  ), 'posted');

  update public.cobre_cruces set transaction_usd_id = v_usd_id, updated_at = now() where id = p_cruce_id;
  return jsonb_build_object('ok', true, 'ya_registrada', false, 'monto_usd', v_c.monto_usd);
end;
$function$;

create or replace function public.cobre_confirmar_transferencia(p_id_txn text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tx record;
  v_banco uuid;
begin
  select id, id_txn, subcuenta_id, ledger_status, monto_operacion, comision, impuesto, currency_code
    into v_tx
    from public.transactions where id_txn = trim(p_id_txn) for update;
  if not found then
    raise exception 'Transferencia % no encontrada', p_id_txn;
  end if;
  if v_tx.ledger_status = 'posted' then
    return jsonb_build_object('ok', true, 'ya_registrada', true, 'id_txn', v_tx.id_txn);
  end if;
  if v_tx.ledger_status <> 'reserved' then
    raise exception 'La transferencia % no tiene fondos reservados (estado contable %)',
      v_tx.id_txn, v_tx.ledger_status;
  end if;

  -- Un envío en dólares desde la instancia propia del comercio sale de sus Balances, no de JPay.
  if v_tx.currency_code = 'USD' then
    v_banco := public._cobre_banco_usd((
      select ct.instancia_id from public.cobre_transferencias ct where ct.id_txn = v_tx.id_txn));
  else
    v_banco := public._cobre_cuenta('banco', v_tx.currency_code);
  end if;

  perform public.ledger_post(v_tx.id, 'envio', public._ledger_lines(
    public._ledger_line(public._ledger_sub_account_id(v_tx.subcuenta_id, 'retenido'), 'debit', v_tx.monto_operacion),
    public._ledger_line(public._ledger_sub_account_id(v_tx.subcuenta_id, 'retenido'), 'debit', v_tx.comision, 'comision'),
    public._ledger_line(public._ledger_sub_account_id(v_tx.subcuenta_id, 'retenido'), 'debit', v_tx.impuesto, 'impuesto'),
    public._ledger_line(v_banco, 'credit', v_tx.monto_operacion),
    public._ledger_line(public._cobre_cuenta('comision', v_tx.currency_code), 'credit', v_tx.comision, 'comision'),
    public._ledger_line(public._cobre_cuenta('iva', v_tx.currency_code), 'credit', v_tx.impuesto, 'impuesto')
  ), 'posted');

  update public.transactions set estado_id = public._estado_movimiento_id('APROBADO') where id = v_tx.id;
  return jsonb_build_object('ok', true, 'ya_registrada', false, 'id_txn', v_tx.id_txn,
    'total_debitado', v_tx.monto_operacion + v_tx.comision + v_tx.impuesto);
end;
$function$;

-- Dólares que deberían estar en los Balances Global + USA de la instancia propia del comercio:
-- sus subcuentas USD (disponible + retenido) más las comisiones de JPay de sus envíos USD, que se
-- quedan en su cuenta hasta cobrarlas.
create or replace function public.cobre_saldo_esperado_usd_instancia(p_legajo text)
returns numeric
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select sum(b.saldo_disponible + b.saldo_retenido)
      from public.subaccounts s join public.subaccount_balances b on b.subaccount_id = s.id
     where s.cliente_legajo = p_legajo and s.moneda = 'USD'
  ), 0)
  + coalesce((
    select sum(t.comision + t.impuesto)
      from public.transactions t
     where t.legajo = p_legajo and t.ledger_status = 'posted' and t.currency_code = 'USD'
       and t.id_txn in (select ct.id_txn from public.cobre_transferencias ct
                         where ct.cliente_legajo = p_legajo and ct.moneda = 'USD'
                           and ct.instancia_id is not null)
  ), 0);
$$;
revoke all on function public.cobre_saldo_esperado_usd_instancia(text) from public, anon, authenticated;
grant execute on function public.cobre_saldo_esperado_usd_instancia(text) to service_role;
