-- ============================================================================
-- 1010_transferencia_externa.sql
-- Permite al cliente transferir fondos desde una de sus subcuentas a un
-- destinatario externo (CBU/CVU de otra entidad). Registra un movimiento
-- de tipo 'transferencia' visible en el historial del cliente y para el admin.
-- ============================================================================

create or replace function public.registrar_transferencia_externa(
  p_subcuenta_origen uuid,
  p_destinatario_cbu text,
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
  v_txn text;
  v_comision numeric := 0;
  v_impuesto numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'Monto invalido';
  end if;

  if p_destinatario_cbu is null or length(trim(p_destinatario_cbu)) < 10 then
    raise exception 'CBU/CVU destino invalido';
  end if;

  select c.id, c.legajo into v_cliente_id, v_legajo
    from public.clientes c
   where c.correo = auth.email();

  if v_cliente_id is null then
    raise exception 'Cliente no encontrado' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.subcuentas
     where id = p_subcuenta_origen
       and cliente_legajo = v_legajo
  ) then
    raise exception 'La subcuenta de origen no pertenece al cliente' using errcode = '42501';
  end if;

  select cbu into v_cbu_origen
    from public.subcuentas
   where id = p_subcuenta_origen;

  if exists (
    select 1
      from public.subcuentas
     where id = p_subcuenta_origen
       and saldo_disponible < p_monto
  ) then
    raise exception 'Saldo insuficiente en la subcuenta de origen';
  end if;

  -- Buscar comision del cliente para transferencias
  select porcentaje into v_comision
    from public.comisiones_cliente
   where cliente_id = v_cliente_id
     and operacion = 'transferencia'
     and estado = 'Habilitado'
   limit 1;

  if v_comision is not null and v_comision > 0 then
    v_comision := round(p_monto * v_comision / 100, 2);
    v_impuesto := round(v_comision * 21 / 100, 2);
  else
    v_comision := 0;
    v_impuesto := 0;
  end if;

  -- Buscar estado 'acreditado' o el primero disponible
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

  v_txn := 'EXT-' || upper(substr(md5(random()::text), 1, 12));

  update public.subcuentas
     set saldo_disponible = saldo_disponible - p_monto - v_comision - v_impuesto
   where id = p_subcuenta_origen;

  insert into public.movimientos (
    cliente_id, legajo, id_txn, tipo, cvu,
    monto_operacion, comision, impuesto, monto_cobrado, estado_id
  ) values (
    v_cliente_id, v_legajo, v_txn, 'transferencia', p_destinatario_cbu,
    p_monto, v_comision, v_impuesto, p_monto, v_estado_id
  );

  return jsonb_build_object(
    'ok', true,
    'id_txn', v_txn,
    'comision', v_comision,
    'impuesto', v_impuesto,
    'total_debitado', p_monto + v_comision + v_impuesto
  );
end;
$$;

revoke execute on function public.registrar_transferencia_externa(uuid, text, numeric, text) from public;
grant execute on function public.registrar_transferencia_externa(uuid, text, numeric, text) to authenticated;
