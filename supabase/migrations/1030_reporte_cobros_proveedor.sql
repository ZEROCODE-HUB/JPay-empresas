-- Fase 8 de Ecart Pay: reportes de cobros.
--
-- `pagos.caja_id`: caja donde se cobró (cobro presencial). Hoy queda vacía porque Ecart Pay no
-- publica cómo cobrar en una terminal por API; los cobros sin caja se reportan como "En línea".
--
-- `reporte_cobros_proveedor`: resumen de un período (días en la zona horaria del país de la
-- instalación) por día, método, sucursal/caja y comercio, más comisiones, reembolsos y
-- contracargos, y el detalle para exportar. Es SECURITY INVOKER: la RLS de `pagos`,
-- `reembolsos` y `contracargos_proveedor` deja al comercio ver solo lo suyo y al backoffice todo.
-- Aditiva.

alter table public.pagos
  add column if not exists caja_id uuid references public.cajas (id) on delete set null;
create index if not exists pagos_caja_idx on public.pagos (caja_id) where caja_id is not null;
create index if not exists pagos_pagado_idx on public.pagos (pagado_at) where pagado_at is not null;

create or replace function public.reporte_cobros_proveedor(
  p_desde date,
  p_hasta date,
  p_comercio_id uuid default null,
  p_proveedor text default 'ecartpay'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to ''
as $$
declare
  v_tz text := coalesce(
    (select timezone from public.paises where predeterminado limit 1), 'UTC'
  );
  v_ini timestamptz;
  v_fin timestamptz;
  v jsonb;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > 366 then
    raise exception 'El período no puede superar un año' using errcode = '22023';
  end if;
  v_ini := p_desde::timestamp at time zone v_tz;
  v_fin := (p_hasta + 1)::timestamp at time zone v_tz;

  with cobrados as (
    select
      p.id, p.comercio_id, p.metodo, p.monto, p.monto_reembolsado, p.comision_proveedor,
      p.neto_proveedor, p.conciliado_at, p.pagado_at, p.pagador_nombre, p.pagador_email, p.proveedor_orden_id,
      p.caja_id, c.nombre as caja, s.id as sucursal_id, s.nombre as sucursal,
      co.nombre_comercio as comercio,
      (p.pagado_at at time zone v_tz)::date as fecha
    from public.pagos p
    left join public.cajas c on c.id = p.caja_id
    left join public.sucursales s on s.id = c.sucursal_id
    left join public.comercios co on co.id = p.comercio_id
    where p.proveedor = p_proveedor
      and p.estado in ('pagado', 'reembolsado', 'parcialmente_reembolsado')
      and p.pagado_at >= v_ini and p.pagado_at < v_fin
      and (p_comercio_id is null or p.comercio_id = p_comercio_id)
  ),
  reemb as (
    select r.monto, (r.finalizado_at at time zone v_tz)::date as fecha
    from public.reembolsos r
    join public.pagos p on p.id = r.pago_id
    where r.proveedor = p_proveedor
      and r.estado = 'aprobado'
      and r.finalizado_at >= v_ini and r.finalizado_at < v_fin
      and (p_comercio_id is null or p.comercio_id = p_comercio_id)
  ),
  contra as (
    select cc.monto, cc.estado
    from public.contracargos_proveedor cc
    left join public.pagos p on p.id = cc.pago_id
    where cc.proveedor = p_proveedor
      and cc.created_at >= v_ini and cc.created_at < v_fin
      and (p_comercio_id is null or p.comercio_id = p_comercio_id)
  ),
  pendientes as (
    select p.monto
    from public.pagos p
    where p.proveedor = p_proveedor
      and p.estado in ('creado', 'pendiente')
      and p.created_at >= v_ini and p.created_at < v_fin
      and (p_comercio_id is null or p.comercio_id = p_comercio_id)
  ),
  dias as (
    select d::date as fecha
    from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') d
  )
  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'timezone', v_tz,
    'resumen', jsonb_build_object(
      'cantidad', (select count(*) from cobrados),
      'cobrado', (select coalesce(sum(monto), 0) from cobrados),
      'comision', (select coalesce(sum(comision_proveedor), 0) from cobrados),
      'neto', (select coalesce(sum(neto_proveedor), 0) from cobrados),
      'sin_conciliar', (select count(*) from cobrados where conciliado_at is null),
      'reembolsado', (select coalesce(sum(monto), 0) from reemb),
      'reembolsos', (select count(*) from reemb),
      'contracargos', (select count(*) from contra),
      'contracargos_monto', (select coalesce(sum(monto), 0) from contra),
      'contracargos_abiertos',
        (select count(*) from contra where estado in ('created', 'pending', 'in_review')),
      'pendientes', (select count(*) from pendientes),
      'pendientes_monto', (select coalesce(sum(monto), 0) from pendientes)
    ),
    'por_dia', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'fecha', d.fecha,
        'cantidad', (select count(*) from cobrados c where c.fecha = d.fecha),
        'monto', (select coalesce(sum(c.monto), 0) from cobrados c where c.fecha = d.fecha),
        'comision',
          (select coalesce(sum(c.comision_proveedor), 0) from cobrados c where c.fecha = d.fecha),
        'reembolsado', (select coalesce(sum(r.monto), 0) from reemb r where r.fecha = d.fecha)
      ) order by d.fecha), '[]'::jsonb)
      from dias d
    ),
    'por_metodo', (
      select coalesce(jsonb_agg(x order by (x->>'monto')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'metodo', coalesce(metodo, 'card'),
          'cantidad', count(*),
          'monto', sum(monto),
          'comision', coalesce(sum(comision_proveedor), 0),
          'reembolsado', sum(monto_reembolsado)
        ) as x
        from cobrados group by coalesce(metodo, 'card')
      ) t
    ),
    'por_sucursal', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object(
          'sucursal_id', sucursal_id,
          'sucursal', sucursal,
          'caja_id', caja_id,
          'caja', caja,
          'cantidad', count(*),
          'monto', sum(monto),
          'comision', coalesce(sum(comision_proveedor), 0)
        ) as x
        from cobrados
        group by sucursal_id, sucursal, caja_id, caja
        order by sucursal nulls first, caja
      ) t
    ),
    'por_comercio', (
      select coalesce(jsonb_agg(x order by (x->>'monto')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'comercio_id', comercio_id,
          'comercio', comercio,
          'cantidad', count(*),
          'monto', sum(monto),
          'comision', coalesce(sum(comision_proveedor), 0),
          'neto', coalesce(sum(neto_proveedor), 0),
          'reembolsado', sum(monto_reembolsado)
        ) as x
        from cobrados group by comercio_id, comercio
      ) t
    ),
    'detalle', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', id,
          'pagado_at', pagado_at,
          'comercio', comercio,
          'metodo', coalesce(metodo, 'card'),
          'monto', monto,
          'comision', comision_proveedor,
          'neto', neto_proveedor,
          'reembolsado', monto_reembolsado,
          'sucursal', sucursal,
          'caja', caja,
          'pagador', coalesce(pagador_nombre, pagador_email),
          'orden', proveedor_orden_id
        ) as x
        from cobrados order by pagado_at desc limit 5000
      ) t
    )
  ) into v;
  return v;
end;
$$;

revoke all on function public.reporte_cobros_proveedor(date, date, uuid, text) from public, anon;
grant execute on function public.reporte_cobros_proveedor(date, date, uuid, text) to authenticated;

comment on function public.reporte_cobros_proveedor(date, date, uuid, text) is
  'Reporte de cobros con un proveedor externo en un período. SECURITY INVOKER: respeta la RLS.';
