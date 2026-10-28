-- El método del pago se fija la primera vez (spei, oxxo, card…) y no lo pisa el tipo genérico
-- que devuelve la orden al confirmarlo (por ejemplo "transfer"). Resto igual que en 1021.
create or replace function public.aplicar_estado_pago(
  p_pago_id uuid,
  p_estado text,
  p_estado_proveedor text default null,
  p_motivo text default null,
  p_metodo text default null,
  p_proveedor_pago_id text default null,
  p_respuesta jsonb default null
)
returns public.pagos
language plpgsql
security definer
set search_path to ''
as $$
declare
  v public.pagos;
  v_link_pago uuid;
begin
  select * into v from public.pagos where id = p_pago_id for update;
  if not found then
    raise exception 'Pago % inexistente', p_pago_id;
  end if;

  -- Un pago confirmado no retrocede a estados previos (avisos fuera de orden).
  if v.estado = 'pagado' and p_estado in ('creado', 'pendiente', 'rechazado', 'error') then
    p_estado := v.estado;
  end if;

  update public.pagos set
    estado = p_estado,
    estado_proveedor = coalesce(p_estado_proveedor, estado_proveedor),
    motivo = case when p_estado = 'pagado' then null else coalesce(p_motivo, motivo) end,
    metodo = coalesce(metodo, p_metodo),
    proveedor_pago_id = coalesce(p_proveedor_pago_id, proveedor_pago_id),
    respuesta = coalesce(p_respuesta, respuesta),
    pagado_at = case when p_estado = 'pagado' then coalesce(pagado_at, now()) else pagado_at end,
    updated_at = now()
  where id = p_pago_id
  returning * into v;

  if v.estado = 'pagado' and v.link_id is not null and v.link_pago_id is null then
    insert into public.cliente_links_pago_pagos (
      link_id, cliente_legajo, metodo, monto, estado, pagador_nombre, pagador_email, referencia
    ) values (
      v.link_id, v.cliente_legajo, coalesce(v.metodo, v.proveedor), v.monto, 'Aprobado',
      v.pagador_nombre, v.pagador_email, v.proveedor || ':' || coalesce(v.proveedor_orden_id, v.id::text)
    )
    returning id into v_link_pago;

    update public.cliente_links_pago set pagos = coalesce(pagos, 0) + 1 where id = v.link_id;
    update public.pagos set link_pago_id = v_link_pago where id = p_pago_id returning * into v;
  end if;

  return v;
end;
$$;

-- Corrige el pago SPEI de prueba que quedó como "transfer".
update public.pagos set metodo = 'spei' where metodo = 'transfer' and referencia ~ '^[0-9]{18}$';
