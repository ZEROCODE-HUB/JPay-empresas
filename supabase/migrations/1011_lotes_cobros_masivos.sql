-- ============================================================================
-- 1011_lotes_cobros_masivos.sql
-- Tablas lotes y lote_registros para cobros masivos.
-- RPCs para CRUD completo y consulta con estadisticas.
-- ============================================================================

-- ---- lotes ----
create table if not exists public.lotes (
  id text primary key,
  cliente_legajo text not null references public.clientes(legajo) on delete cascade,
  nombre text not null,
  periodo text not null,
  dia_pago integer not null default 15,
  tasa_interes numeric(5,2) not null default 0,
  fecha_venc_1 date not null,
  fecha_venc_2 date,
  fecha_venc_3 date,
  medios_pago jsonb not null default '["TRANSFERENCIA"]'::jsonb,
  pagos_parciales boolean not null default true,
  notificaciones boolean not null default false,
  estado text not null default 'cargado',
  created_at timestamptz not null default now(),
  fecha_inicio timestamptz,
  fecha_finalizacion timestamptz
);
create index if not exists idx_lotes_cliente on public.lotes(cliente_legajo);

-- ---- lote_registros ----
create table if not exists public.lote_registros (
  id text primary key,
  lote_id text not null references public.lotes(id) on delete cascade,
  tipo_entidad text not null,
  id_entidad text not null,
  sub_entidad text not null,
  identificacion_usuario text not null,
  monto numeric(14,2) not null,
  descripcion text not null default '',
  email text,
  periodo_facturacion text,
  id_unico_beneficiario text,
  fecha_venc_1 date,
  fecha_venc_2 date,
  fecha_venc_3 date,
  tasa_interes numeric(5,2),
  medios_pago jsonb,
  pagos_parciales boolean,
  cbu_id text,
  link_de_pago text,
  estado text not null default 'pendiente',
  monto_pagado numeric(14,2) not null default 0,
  fecha_pago timestamptz,
  email_enviado boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_lote_registros_lote on public.lote_registros(lote_id);

-- ---- RLS ----
alter table public.lotes enable row level security;
alter table public.lote_registros enable row level security;

drop policy if exists lotes_cliente on public.lotes;
create policy lotes_cliente on public.lotes
  for all to anon, authenticated
  using (cliente_legajo = public.legajo_de_sesion())
  with check (cliente_legajo = public.legajo_de_sesion());

drop policy if exists lote_registros_cliente on public.lote_registros;
create policy lote_registros_cliente on public.lote_registros
  for all to anon, authenticated
  using (exists (
    select 1 from public.lotes l
    where l.id = lote_id and l.cliente_legajo = public.legajo_de_sesion()
  ))
  with check (exists (
    select 1 from public.lotes l
    where l.id = lote_id and l.cliente_legajo = public.legajo_de_sesion()
  ));

-- ---- RPC: crear_lote ----
create or replace function public.crear_lote(
  p_id text,
  p_cliente_legajo text,
  p_nombre text,
  p_periodo text,
  p_dia_pago integer,
  p_tasa_interes numeric,
  p_fecha_venc_1 date,
  p_fecha_venc_2 date,
  p_fecha_venc_3 date,
  p_medios_pago jsonb,
  p_pagos_parciales boolean,
  p_notificaciones boolean
) returns void
language sql security definer
set search_path = public
as $$
  insert into public.lotes (
    id, cliente_legajo, nombre, periodo, dia_pago, tasa_interes,
    fecha_venc_1, fecha_venc_2, fecha_venc_3,
    medios_pago, pagos_parciales, notificaciones
  ) values (
    p_id, p_cliente_legajo, p_nombre, p_periodo, p_dia_pago, p_tasa_interes,
    p_fecha_venc_1, p_fecha_venc_2, p_fecha_venc_3,
    p_medios_pago, p_pagos_parciales, p_notificaciones
  );
$$;

grant execute on function public.crear_lote(text,text,text,text,integer,numeric,date,date,date,jsonb,boolean,boolean) to anon, authenticated;

-- ---- RPC: agregar_registros_lote (batch insert) ----
create or replace function public.agregar_registros_lote(
  p_lote_id text,
  p_registros jsonb
) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_reg jsonb;
begin
  for v_reg in select jsonb_array_elements(p_registros)
  loop
    insert into public.lote_registros (
      id, lote_id, tipo_entidad, id_entidad, sub_entidad,
      identificacion_usuario, monto, descripcion, email,
      periodo_facturacion, id_unico_beneficiario,
      fecha_venc_1, fecha_venc_2, fecha_venc_3,
      tasa_interes, medios_pago, pagos_parciales
    ) values (
      (v_reg->>'id')::text,
      p_lote_id,
      (v_reg->>'tipo_entidad')::text,
      (v_reg->>'id_entidad')::text,
      (v_reg->>'sub_entidad')::text,
      (v_reg->>'identificacion_usuario')::text,
      (v_reg->>'monto')::numeric,
      coalesce((v_reg->>'descripcion')::text, ''),
      (v_reg->>'email')::text,
      (v_reg->>'periodo_facturacion')::text,
      (v_reg->>'id_unico_beneficiario')::text,
      (v_reg->>'fecha_venc_1')::date,
      (v_reg->>'fecha_venc_2')::date,
      (v_reg->>'fecha_venc_3')::date,
      (v_reg->>'tasa_interes')::numeric,
      (v_reg->>'medios_pago')::jsonb,
      (v_reg->>'pagos_parciales')::boolean
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function public.agregar_registros_lote(text,jsonb) to anon, authenticated;

-- ---- RPC: actualizar_estado_lote ----
create or replace function public.actualizar_estado_lote(
  p_lote_id text,
  p_estado text
) returns void
language sql security definer
set search_path = public
as $$
  update public.lotes
     set estado = p_estado,
         fecha_inicio = case when p_estado = 'en_proceso' then now() else fecha_inicio end,
         fecha_finalizacion = case when p_estado = 'finalizado' then now() else fecha_finalizacion end
   where id = p_lote_id;
$$;

grant execute on function public.actualizar_estado_lote(text,text) to anon, authenticated;

-- ---- RPC: eliminar_lote ----
create or replace function public.eliminar_lote(p_lote_id text)
returns void
language sql security definer
set search_path = public
as $$
  update public.lotes set estado = 'eliminado' where id = p_lote_id;
$$;

grant execute on function public.eliminar_lote(text) to anon, authenticated;

-- ---- RPC: actualizar_link_registro ----
create or replace function public.actualizar_link_registro(
  p_registro_id text,
  p_link text
) returns void
language sql security definer
set search_path = public
as $$
  update public.lote_registros set link_de_pago = p_link where id = p_registro_id;
$$;

grant execute on function public.actualizar_link_registro(text,text) to anon, authenticated;

-- ---- RPC: incrementar_vistas_lote ----
create or replace function public.incrementar_vistas_lote(p_lote_id text)
returns void
language sql security definer
set search_path = public
as $$
  -- placeholder: incrementa vistas si se agrega columna en futuro
  select 1;
$$;

grant execute on function public.incrementar_vistas_lote(text) to anon, authenticated;
