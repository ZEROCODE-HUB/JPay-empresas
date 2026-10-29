-- Correcciones de la revisión de código de Cobre (2026-10-29).
--
-- `cobre_registrar_deposito`:
-- - Un depósito `sin_asignar` con la devolución en curso o completada ya no se acredita si después
--   aparece su dueño (el dinero vuelve al remitente; acreditarlo lo duplicaba).
-- - La subcuenta de respaldo del Balance del comercio es la más antigua **en pesos** (antes podía
--   tomar la de dólares y acreditar pesos como dólares).
-- Aditiva.

CREATE OR REPLACE FUNCTION public.cobre_registrar_deposito(p_modo text, p_transaccion_id text, p_cuenta_externa_id text, p_clabe text, p_monto numeric, p_remitente text DEFAULT NULL::text, p_remitente_cuenta text DEFAULT NULL::text, p_remitente_id text DEFAULT NULL::text, p_clave_rastreo text DEFAULT NULL::text, p_cep text DEFAULT NULL::text, p_fecha timestamp with time zone DEFAULT NULL::timestamp with time zone, p_subcuenta_id uuid DEFAULT NULL::uuid, p_origen text DEFAULT 'spei'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_txn text := 'COBRE-' || trim(p_transaccion_id);
  v_dep public.cobre_depositos;
  v_sub uuid;
  v_legajo text;
  v_cliente_id uuid;
  v_tx_id uuid;
  v_comision numeric := 0;
  v_impuesto numeric := 0;
  v_pct_iva numeric;
  v_eval jsonb;
  v_block uuid;
  v_bucket text := 'disponible';
begin
  if p_transaccion_id is null or length(trim(p_transaccion_id)) = 0 then
    raise exception 'Falta el id de la transacción de Cobre';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto <> round(p_monto, 2) then
    raise exception 'Importe inválido';
  end if;
  if p_origen not in ('spei', 'r2p') then
    raise exception 'Origen inválido';
  end if;

  select * into v_dep from public.cobre_depositos
   where modo = p_modo and transaccion_externa_id = trim(p_transaccion_id) for update;
  if found and v_dep.estado <> 'sin_asignar' then
    return jsonb_build_object('estado', 'ya_registrado', 'deposito_id', v_dep.id);
  end if;
  -- Con una devolución en curso o hecha, el dinero vuelve al remitente: no se acredita.
  if found and v_dep.devolucion_estado is not null and v_dep.devolucion_estado not in ('rechazada', 'fallida', 'cancelada', 'error_envio') then
    return jsonb_build_object('estado', 'en_devolucion', 'deposito_id', v_dep.id);
  end if;

  -- 1) Subcuenta explícita (cobro R2P). 2) CLABE conocida. 3) Balance del comercio que recibió.
  if p_subcuenta_id is not null then
    select s.id, s.cliente_legajo into v_sub, v_legajo from public.subaccounts s where s.id = p_subcuenta_id;
  end if;
  if v_sub is null then
    select c.subcuenta_id, c.cliente_legajo into v_sub, v_legajo
      from public.cobre_clabes c
     where c.modo = p_modo and c.clabe = trim(coalesce(p_clabe, '')) and c.estado = 'activa';
  end if;
  if v_sub is null and p_cuenta_externa_id is not null then
    select coalesce(k.subcuenta_id, (
             select s.id from public.subaccounts s
              where s.cliente_legajo = k.cliente_legajo and s.estado = 'Activa'
                and coalesce(s.moneda, 'MXN') = 'MXN'
              order by s.created_at limit 1)),
           k.cliente_legajo
      into v_sub, v_legajo
      from public.cobre_cuentas k
     where k.modo = p_modo and k.cuenta_externa_id = trim(p_cuenta_externa_id)
       and k.tipo = 'cliente' and k.estado = 'activa';
  end if;

  if v_sub is null then
    insert into public.cobre_depositos (
      modo, transaccion_externa_id, cuenta_externa_id, clabe, monto, remitente, remitente_cuenta,
      remitente_id, clave_rastreo, cep, estado, fecha_operacion, origen
    ) values (
      p_modo, trim(p_transaccion_id), p_cuenta_externa_id, p_clabe, p_monto, p_remitente,
      p_remitente_cuenta, p_remitente_id, p_clave_rastreo, p_cep, 'sin_asignar', p_fecha, p_origen
    ) on conflict (modo, transaccion_externa_id) do nothing;
    return jsonb_build_object('estado', 'sin_asignar', 'clabe', p_clabe);
  end if;

  select id into v_cliente_id from public.clientes where legajo = v_legajo;
  perform public._lock_cliente_reglas(v_cliente_id);

  select k.comision, k.impuesto into v_comision, v_impuesto
    from public.calcular_comision(v_cliente_id, p_monto, v_sub, 'Depósito', null) k;
  v_comision := coalesce(v_comision, 0);
  v_impuesto := coalesce(v_impuesto, 0);
  if v_comision + v_impuesto > p_monto then
    v_pct_iva := case when v_comision > 0 then v_impuesto * 100 / v_comision else 0 end;
    v_comision := round(p_monto * 100 / (100 + v_pct_iva), 2);
    v_impuesto := p_monto - v_comision;
  end if;

  insert into public.transactions (
    cliente_id, legajo, id_txn, tipo, cvu, subcuenta_id, destinatario_nombre, destinatario_cuit,
    monto_operacion, comision, impuesto, monto_cobrado, estado_id, fecha
  ) values (
    v_cliente_id, v_legajo, v_txn, 'deposito', coalesce(nullif(trim(p_remitente_cuenta), ''), trim(coalesce(p_clabe, ''))),
    v_sub, nullif(trim(coalesce(p_remitente, '')), ''), nullif(trim(coalesce(p_remitente_id, '')), ''),
    p_monto, v_comision, v_impuesto, v_comision + v_impuesto,
    public._estado_movimiento_id('APROBADO'), coalesce(p_fecha, now())
  )
  on conflict (id_txn) do nothing
  returning id into v_tx_id;
  if v_tx_id is null then
    return jsonb_build_object('estado', 'ya_registrado', 'id_txn', v_txn);
  end if;

  v_eval := public.evaluar_reglas_operacion(v_tx_id, 'deposit');
  v_block := public._bloqueo_activo(v_cliente_id, v_sub);
  if v_block is null and v_eval ->> 'decision' = 'block' then
    v_block := public._registrar_bloqueo_regla(v_cliente_id, (v_eval ->> 'block_rule_id')::uuid,
      (v_eval ->> 'block_alert_id')::uuid, v_tx_id, v_eval ->> 'block_reason');
  end if;
  if v_block is not null then
    v_bucket := 'retenido';
    update public.transactions set held_block_id = v_block where id = v_tx_id;
  end if;

  perform public.ledger_post(v_tx_id, 'acreditacion', public._ledger_lines(
    public._ledger_line(public._ledger_account_id('BANCO_COBRE'), 'debit', p_monto),
    public._ledger_line(public._ledger_sub_account_id(v_sub, v_bucket), 'credit', p_monto),
    public._ledger_line(public._ledger_sub_account_id(v_sub, v_bucket), 'debit', v_comision, 'comision'),
    public._ledger_line(public._ledger_account_id('INGRESOS_COMISIONES_MXN'), 'credit', v_comision, 'comision'),
    public._ledger_line(public._ledger_sub_account_id(v_sub, v_bucket), 'debit', v_impuesto, 'impuesto'),
    public._ledger_line(public._ledger_account_id('IVA_DEBITO_FISCAL_MXN'), 'credit', v_impuesto, 'impuesto')
  ), 'posted');

  insert into public.cobre_depositos (
    modo, transaccion_externa_id, cuenta_externa_id, clabe, monto, remitente, remitente_cuenta,
    remitente_id, clave_rastreo, cep, estado, subcuenta_id, cliente_legajo, transaction_id,
    fecha_operacion, origen
  ) values (
    p_modo, trim(p_transaccion_id), p_cuenta_externa_id, p_clabe, p_monto, p_remitente,
    p_remitente_cuenta, p_remitente_id, p_clave_rastreo, p_cep, 'acreditado', v_sub, v_legajo,
    v_tx_id, p_fecha, p_origen
  )
  on conflict (modo, transaccion_externa_id) do update set
    estado = 'acreditado', subcuenta_id = excluded.subcuenta_id,
    cliente_legajo = excluded.cliente_legajo, transaction_id = excluded.transaction_id;

  return jsonb_build_object('estado', 'acreditado', 'id_txn', v_txn, 'legajo', v_legajo,
    'subcuenta_id', v_sub, 'transaction_id', v_tx_id, 'importe', p_monto, 'comision', v_comision,
    'impuesto', v_impuesto, 'retenido', v_bucket = 'retenido', 'decision', v_eval ->> 'decision');
end;
$function$;
