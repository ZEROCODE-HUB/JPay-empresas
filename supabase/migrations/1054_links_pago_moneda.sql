-- Moneda del link de pago (pregunta de JPay del 3/11/2026): Ecart Pay acepta órdenes en otras
-- monedas (MXN, USD). Por defecto MXN; en USD se cobra solo con tarjeta (SPEI, OXXO y la CLABE
-- de Cobre son en pesos). `obtener_link_pago` la devuelve. Aditiva.
alter table public.cliente_links_pago
  add column if not exists moneda text not null default 'MXN' check (moneda in ('MXN', 'USD', 'ARS'));

-- Los links de Argentina siguen en pesos argentinos.
update public.cliente_links_pago l
   set moneda = 'ARS'
  from public.clientes c
 where c.legajo = l.cliente_legajo and coalesce(c.pais, 'AR') = 'AR' and l.moneda = 'MXN';

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
  select * into v_link from cliente_links_pago where url like '%' || p_codigo limit 1;
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
