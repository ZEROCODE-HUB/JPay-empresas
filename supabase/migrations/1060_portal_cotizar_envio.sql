-- Antes de transferir, el portal muestra la comisión y el IVA y valida que el saldo alcance para
-- el TOTAL (monto + comisión + IVA). Antes comparaba solo el monto y la operación fallaba después.
-- Misma regla que usa la reserva (calcular_comision_transferencia). Aditiva.
create or replace function public.portal_cotizar_envio(
  p_subaccount_id uuid,
  p_monto numeric,
  p_destino text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_legajo text := public.current_cliente_legajo();
  v_cliente_id uuid;
  v_disponible numeric;
  v_comision numeric := 0;
  v_iva numeric := 0;
begin
  select c.id into v_cliente_id from public.clientes c where c.legajo = v_legajo;
  select coalesce(b.saldo_disponible, 0) into v_disponible
    from public.subaccounts s
    left join public.subaccount_balances b on b.subaccount_id = s.id
   where s.id = p_subaccount_id and s.cliente_legajo = v_legajo;
  if v_cliente_id is null or v_disponible is null then
    raise exception 'Subcuenta no encontrada' using errcode = '42501';
  end if;
  if coalesce(p_monto, 0) > 0 then
    select coalesce(k.comision, 0), coalesce(k.impuesto, 0) into v_comision, v_iva
      from public.calcular_comision_transferencia(v_cliente_id, p_monto, p_subaccount_id, p_destino) k;
  end if;
  return jsonb_build_object(
    'monto', coalesce(p_monto, 0),
    'comision', coalesce(v_comision, 0),
    'iva', coalesce(v_iva, 0),
    'total', coalesce(p_monto, 0) + coalesce(v_comision, 0) + coalesce(v_iva, 0),
    'disponible', v_disponible,
    'alcanza', coalesce(p_monto, 0) + coalesce(v_comision, 0) + coalesce(v_iva, 0) <= v_disponible
  );
end;
$$;

revoke all on function public.portal_cotizar_envio(uuid, numeric, text) from public, anon;
grant execute on function public.portal_cotizar_envio(uuid, numeric, text) to authenticated;
