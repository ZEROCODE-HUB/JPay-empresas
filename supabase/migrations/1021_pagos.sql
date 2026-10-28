-- Fase 4 de Ecart Pay: cobros online.
--
-- `pagos`: tabla genérica de cobros con proveedores externos (plan 3.2 punto 6). Cada intento
-- de pago tiene su `idempotency_key` (nunca se crean dos órdenes para el mismo intento). La
-- escriben solo las Edge Functions (service role); el comercio y el backoffice la leen por RLS.
--
-- `aplicar_estado_pago`: único punto que cambia el estado de un pago. Es idempotente: la
-- primera vez que un pago queda `pagado` lo registra en `cliente_links_pago_pagos` (panel y
-- estadísticas del link) y suma el contador del link. No toca saldos ni el ledger: en el
-- modelo `directo` el dinero queda en la cuenta del comercio en el proveedor.
-- Aditiva.

create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null references public.proveedores_pago (codigo) on update cascade,
  conexion_id uuid references public.comercio_proveedores (id) on delete set null,
  comercio_id uuid references public.comercios (id) on delete set null,
  cliente_legajo text,
  link_id uuid references public.cliente_links_pago (id) on delete set null,
  link_pago_id uuid references public.cliente_links_pago_pagos (id) on delete set null,
  entorno text not null check (entorno in ('sandbox', 'produccion')),
  proveedor_orden_id text,
  proveedor_pago_id text,
  metodo text,
  monto numeric(14, 2) not null check (monto > 0),
  moneda text not null,
  estado text not null default 'creado' check (
    estado in (
      'creado', 'pendiente', 'pagado', 'rechazado', 'cancelado', 'reembolsado',
      'parcialmente_reembolsado', 'error'
    )
  ),
  estado_proveedor text,
  motivo text,
  pagador_nombre text,
  pagador_email text,
  pay_link text,
  idempotency_key text not null unique,
  respuesta jsonb not null default '{}'::jsonb,
  pagado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proveedor, proveedor_orden_id)
);

create index if not exists pagos_comercio_idx on public.pagos (comercio_id, created_at desc);
create index if not exists pagos_link_idx on public.pagos (link_id);
create index if not exists pagos_pendientes_idx on public.pagos (estado, created_at)
  where estado in ('creado', 'pendiente');

alter table public.pagos enable row level security;
revoke all on public.pagos from anon;
revoke insert, update, delete on public.pagos from authenticated;
grant select on public.pagos to authenticated;

drop policy if exists pagos_select on public.pagos;
create policy pagos_select on public.pagos for select to authenticated using (
  public.es_backoffice()
  or cliente_legajo = public.current_cliente_legajo()
);

comment on table public.pagos is
  'Cobros con proveedores externos (Ecart Pay, ...). Solo escriben las Edge Functions.';

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
    metodo = coalesce(p_metodo, metodo),
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

revoke execute on function public.aplicar_estado_pago(uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.aplicar_estado_pago(uuid, text, text, text, text, text, jsonb)
  to service_role;
