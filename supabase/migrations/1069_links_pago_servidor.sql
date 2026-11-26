-- Links de pago y cobros masivos: el servidor genera el código y crea todo de una vez (26/11/2026).
--
-- Antes:
--  * El navegador generaba el código ("LP-" + 6 caracteres de Math.random) y el checkout buscaba
--    el link con `url like '%' || código`: un cliente podía crear un link cuya URL terminara igual
--    que la de otro (o usar comodines) y quedarse con sus pagos.
--  * El cliente podía cambiar url, comercio, contador de pagos o el monto de un link ya cobrado.
--  * Crear un link y su detalle, crear un lote y sus registros o generar los links de un lote eran
--    varias llamadas: un fallo a mitad dejaba datos a medias.
-- Ahora el código es aleatorio (48 bits) y único, el checkout busca por igualdad exacta y las
-- altas se hacen en una sola transacción. Aditiva.

alter table public.cliente_links_pago add column if not exists codigo text;
update public.cliente_links_pago
   set codigo = split_part(url, '/', -1)
 where codigo is null and url is not null and split_part(url, '/', -1) <> '';
create unique index if not exists cliente_links_pago_codigo_key
  on public.cliente_links_pago (codigo);

create or replace function public.nuevo_codigo_link()
returns text
language sql
volatile
set search_path to ''
as $$
  -- Los primeros 12 hex de un UUID v4 son aleatorios (48 bits).
  select 'LP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;

-- Protección de columnas. Es SECURITY INVOKER a propósito: `current_user` debe ser el rol que
-- llama ('authenticated' desde el portal; el dueño dentro de funciones SECURITY DEFINER;
-- 'service_role' desde las Edge Functions).
create or replace function public.tg_links_pago_proteger()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_cliente boolean := current_user in ('authenticated', 'anon') and not public.is_admin();
  v_origen text;
begin
  if tg_op = 'INSERT' then
    if v_cliente or new.codigo is null then
      new.codigo := public.nuevo_codigo_link();
      v_origen := substring(coalesce(new.url, '') from '^https?://[^/?#]+');
      new.url := coalesce(v_origen, '') || '/p/' || new.codigo;
    end if;
    if v_cliente then
      new.pagos := 0;
      new.vistas := 0;
      -- El comercio tiene que ser del mismo cliente (la RLS de `comercios` solo muestra los suyos).
      if new.comercio_id is not null
         and not exists (select 1 from public.comercios c where c.id = new.comercio_id) then
        raise exception 'Comercio inválido' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if v_cliente then
    new.codigo := old.codigo;
    new.url := old.url;
    new.cliente_legajo := old.cliente_legajo;
    new.comercio_id := old.comercio_id;
    new.pagos := old.pagos;
    new.vistas := old.vistas;
    new.created_at := old.created_at;
    -- Un link con pagos no cambia de monto ni de moneda.
    if coalesce(old.pagos, 0) > 0 then
      new.monto := old.monto;
      new.moneda := old.moneda;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists links_pago_proteger on public.cliente_links_pago;
create trigger links_pago_proteger
  before insert or update on public.cliente_links_pago
  for each row execute function public.tg_links_pago_proteger();

-- Checkout público: búsqueda exacta por código.
create or replace function public.obtener_link_pago(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_link cliente_links_pago%rowtype;
  v_det jsonb;
begin
  if p_codigo is null or p_codigo !~ '^[A-Za-z0-9-]{4,40}$' then
    return null;
  end if;
  select * into v_link from cliente_links_pago where codigo = p_codigo;
  if v_link.id is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'producto_nombre', d.producto_nombre,
    'cantidad', d.cantidad,
    'precio_unitario', d.precio_unitario
  )), '[]'::jsonb) into v_det
  from cliente_links_pago_detalle d where d.link_id = v_link.id;
  return jsonb_build_object(
    'id', v_link.id,
    'url', v_link.url,
    'estado', v_link.estado,
    'referencia', v_link.referencia,
    'notas', v_link.notas,
    'expira_en', v_link.expira_en,
    'pagos_parciales', v_link.pagos_parciales,
    'metodos_pago', v_link.metodos_pago,
    'cliente_legajo', v_link.cliente_legajo,
    'monto', v_link.monto,
    'moneda', v_link.moneda,
    'detalle', v_det
  );
end $function$;

-- Alta de un link con sus productos, en una transacción. El precio sale del catálogo del
-- cliente (no del navegador). SECURITY INVOKER: corren la RLS y el trigger de arriba.
-- p_link: { comercio_id, url_base, estado, referencia, notas, expira_en, pagos_parciales,
--           metodos_pago, moneda }   p_productos: [{ producto_id, cantidad }]
create or replace function public.crear_link_pago(p_link jsonb, p_productos jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_legajo text := public.legajo_de_sesion();
  v_comercio public.comercios;
  v_link public.cliente_links_pago;
  v_monto numeric := 0;
  v_item jsonb;
  v_prod public.productos;
  v_cant int;
begin
  if v_legajo is null then
    raise exception 'Sesión no disponible' using errcode = '42501';
  end if;
  if jsonb_typeof(p_productos) is distinct from 'array' or jsonb_array_length(p_productos) = 0 then
    raise exception 'Selecciona al menos un producto' using errcode = '22023';
  end if;
  select * into v_comercio from public.comercios where id = (p_link->>'comercio_id')::uuid;
  if v_comercio.id is null then
    raise exception 'Comercio inválido' using errcode = '42501';
  end if;

  insert into public.cliente_links_pago (
    cliente_legajo, comercio_id, comercio_nombre, url, monto, estado, referencia, notas,
    expira_en, pagos_parciales, metodos_pago, moneda
  ) values (
    v_legajo, v_comercio.id, coalesce(v_comercio.nombre_comercio, ''), p_link->>'url_base', 0,
    coalesce(nullif(p_link->>'estado', ''), 'Activo'), nullif(p_link->>'referencia', ''),
    nullif(p_link->>'notas', ''), nullif(p_link->>'expira_en', '')::timestamptz,
    coalesce((p_link->>'pagos_parciales')::boolean, false), p_link->'metodos_pago',
    coalesce(nullif(p_link->>'moneda', ''), 'MXN')
  ) returning * into v_link;

  for v_item in select * from jsonb_array_elements(p_productos) loop
    select * into v_prod from public.productos
     where id = (v_item->>'producto_id')::uuid and cliente_legajo = v_legajo;
    if v_prod.id is null then
      raise exception 'Producto inexistente' using errcode = '22023';
    end if;
    v_cant := coalesce((v_item->>'cantidad')::int, 1);
    if v_cant < 1 or v_cant > 10000 then
      raise exception 'Cantidad inválida' using errcode = '22023';
    end if;
    insert into public.cliente_links_pago_detalle (link_id, producto_id, producto_nombre, cantidad, precio_unitario)
    values (v_link.id, v_prod.id, v_prod.nombre, v_cant, v_prod.precio);
    v_monto := v_monto + coalesce(v_prod.precio, 0) * v_cant;
  end loop;

  if v_monto <= 0 then
    raise exception 'El monto del link debe ser mayor a cero' using errcode = '22023';
  end if;
  update public.cliente_links_pago set monto = v_monto where id = v_link.id;

  return jsonb_build_object('id', v_link.id, 'url', v_link.url, 'codigo', v_link.codigo, 'monto', v_monto);
end;
$$;

revoke all on function public.crear_link_pago(jsonb, jsonb) from public, anon;
grant execute on function public.crear_link_pago(jsonb, jsonb) to authenticated;

-- Cobros masivos: lote y registros juntos.
create or replace function public.crear_lote_con_registros(
  p_id text, p_cliente_legajo text, p_nombre text, p_periodo text, p_dia_pago integer,
  p_tasa_interes numeric, p_fecha_venc_1 date, p_fecha_venc_2 date, p_fecha_venc_3 date,
  p_medios_pago jsonb, p_pagos_parciales boolean, p_notificaciones boolean, p_registros jsonb
)
returns integer
language plpgsql
set search_path to ''
as $$
begin
  -- Las dos validan el acceso al legajo / lote.
  perform public.crear_lote(
    p_id, p_cliente_legajo, p_nombre, p_periodo, p_dia_pago, p_tasa_interes,
    p_fecha_venc_1, p_fecha_venc_2, p_fecha_venc_3, p_medios_pago, p_pagos_parciales,
    p_notificaciones
  );
  if p_registros is null or jsonb_array_length(p_registros) = 0 then
    return 0;
  end if;
  return public.agregar_registros_lote(p_id, p_registros);
end;
$$;

revoke all on function public.crear_lote_con_registros(text, text, text, text, integer, numeric, date, date, date, jsonb, boolean, boolean, jsonb) from public, anon;
grant execute on function public.crear_lote_con_registros(text, text, text, text, integer, numeric, date, date, date, jsonb, boolean, boolean, jsonb) to authenticated;

-- Cobros masivos: pone el lote en proceso y genera los links que falten, todo o nada.
-- Devuelve cuántos links creó.
create or replace function public.iniciar_lote(p_lote_id text, p_url_base text, p_forzar boolean default false)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_lote public.lotes;
  v_reg record;
  v_link public.cliente_links_pago;
  v_medios jsonb;
  v_n int := 0;
begin
  -- SECURITY DEFINER (como las demás funciones de lotes): el acceso se valida acá.
  perform public.exigir_acceso_lote(p_lote_id);
  select * into v_lote from public.lotes where id = p_lote_id for update;
  if v_lote.id is null then
    raise exception 'Lote inexistente' using errcode = '22023';
  end if;
  -- medios_pago a veces quedó guardado como texto JSON dentro del jsonb.
  v_medios := case jsonb_typeof(v_lote.medios_pago)
                when 'string' then (v_lote.medios_pago #>> '{}')::jsonb
                else v_lote.medios_pago end;
  if jsonb_typeof(v_medios) is distinct from 'array' or jsonb_array_length(v_medios) = 0 then
    v_medios := '["TRANSFERENCIA"]'::jsonb;
  end if;
  if v_lote.estado is distinct from 'en_proceso' then
    perform public.actualizar_estado_lote(p_lote_id, 'en_proceso');
  end if;
  if p_forzar then
    update public.lote_registros set link_de_pago = null where lote_id = p_lote_id;
  end if;

  for v_reg in
    select id, monto, descripcion, identificacion_usuario
      from public.lote_registros
     where lote_id = p_lote_id and link_de_pago is null
     order by created_at
  loop
    insert into public.cliente_links_pago (
      cliente_legajo, comercio_nombre, url, monto, estado, metodos_pago, pagos_parciales
    ) values (
      v_lote.cliente_legajo,
      coalesce(nullif(v_reg.descripcion, ''), v_reg.identificacion_usuario, ''),
      p_url_base,
      v_reg.monto,
      'Activo',
      v_medios,
      coalesce(v_lote.pagos_parciales, false)
    ) returning * into v_link;

    insert into public.cliente_links_pago_detalle (link_id, producto_id, producto_nombre, cantidad, precio_unitario)
    values (
      v_link.id, null,
      coalesce(nullif(v_reg.descripcion, ''), nullif(v_reg.identificacion_usuario, ''), 'Cobro lote'),
      1, v_reg.monto
    );
    update public.lote_registros set link_de_pago = v_link.url where id = v_reg.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.iniciar_lote(text, text, boolean) from public, anon;
grant execute on function public.iniciar_lote(text, text, boolean) to authenticated;
