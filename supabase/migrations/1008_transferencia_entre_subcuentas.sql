-- ============================================================================
-- 1008_transferencia_entre_subcuentas.sql
-- Permite al cliente dueño transferir saldo entre sus propias subcuentas de
-- forma atomica: debita el saldo disponible de la subcuenta origen, acredita
-- en la subcuenta destino y registra dos movimientos (egreso e ingreso) con
-- la misma operacion, visibles en el historial del cliente y para el admin.
--
-- Los movimientos se crean aqui (SECURITY DEFINER) porque los clientes no
-- tienen politica RLS de INSERT sobre public.movimientos: su registro solo
-- se permite a traves de funciones de servidor.
-- ============================================================================

create or replace function public.registrar_transferencia_subcuentas(
  p_subcuenta_origen uuid,
  p_subcuenta_destino uuid,
  p_monto numeric,
  p_concepto text default null::text
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_legajo text;
  v_estado_id smallint;
  v_cbu_origen text;
  v_cbu_destino text;
  v_txn text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'Monto invalido';
  end if;

  if p_subcuenta_origen = p_subcuenta_destino then
    raise exception 'Las subcuentas deben ser distintas';
  end if;

  select c.id, c.legajo into v_cliente_id, v_legajo
    from public.clientes c
   where c.correo = auth.email();

  if v_cliente_id is null then
    raise exception 'Cliente no encontrado' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.subcuentas so
      join public.subcuentas sd on true
     where so.id = p_subcuenta_origen
       and sd.id = p_subcuenta_destino
       and so.cliente_legajo = v_legajo
       and sd.cliente_legajo = v_legajo
  ) then
    raise exception 'Subcuentas no pertenecen al cliente' using errcode = '42501';
  end if;

  select cbu into v_cbu_origen
    from public.subcuentas
   where id = p_subcuenta_origen;

  select cbu into v_cbu_destino
    from public.subcuentas
   where id = p_subcuenta_destino;

  if exists (
    select 1
      from public.subcuentas
     where id = p_subcuenta_origen
       and saldo_disponible < p_monto
  ) then
    raise exception 'Saldo insuficiente en la subcuenta de origen';
  end if;

  select id into v_estado_id
    from public.estados_movimiento
   where lower(codigo) like '%acredit%'
      or lower(nombre) like '%acredit%'
   order by id
   limit 1;

  if v_estado_id is null then
    select id into v_estado_id
      from public.estados_movimiento
     order by id
     limit 1;
  end if;

  if v_estado_id is null then
    raise exception 'No hay estados de movimiento configurados';
  end if;

  v_txn := 'INT-' || upper(substr(md5(random()::text), 1, 12));

  update public.subcuentas
     set saldo_disponible = saldo_disponible - p_monto
   where id = p_subcuenta_origen;

  update public.subcuentas
     set saldo_disponible = saldo_disponible + p_monto
   where id = p_subcuenta_destino;

  insert into public.movimientos (
    cliente_id, legajo, id_txn, tipo, cvu,
    monto_operacion, comision, impuesto, monto_cobrado, estado_id
  ) values (
    v_cliente_id, v_legajo, v_txn || '-E', 'transferencia', v_cbu_origen,
    p_monto, 0, 0, 0, v_estado_id
  );

  insert into public.movimientos (
    cliente_id, legajo, id_txn, tipo, cvu,
    monto_operacion, comision, impuesto, monto_cobrado, estado_id
  ) values (
    v_cliente_id, v_legajo, v_txn || '-C', 'deposito', v_cbu_destino,
    p_monto, 0, 0, 0, v_estado_id
  );

  return jsonb_build_object('ok', true, 'id_txn', v_txn);
end;
$$;

revoke execute on function public.registrar_transferencia_subcuentas(uuid, uuid, numeric, text) from public;
grant execute on function public.registrar_transferencia_subcuentas(uuid, uuid, numeric, text) to authenticated;