-- ============================================================================
-- 0022_adelantos_reales.sql  (el portal de empresas)
-- Adelanto real conectado a los lotes de acreditación de el panel de administración
-- (mismo proyecto Supabase: lotes_acreditacion / lote_movimientos / adelantos).
--
--  - Helper usuario_comercio_id(): resuelve el comercio del usuario autenticado
--    vía clientes.correo -> clientes.legajo -> comercios.legajo.
--  - Columnas faltantes en adelantos usadas por el portal.
--  - RLS: el comercio autenticado ve sus lotes y adelantos e inserta adelantos.
--  - RPC ingresar_adelanto(security definer): valida en la base que el monto no
--    supere el disponible = Σ importe_neto de lotes NO resueltos (Acreditado /
--    Rechazado quedan fuera; importe_neto ya neto de impuestos y comisiones
--    Payway + plataforma) - adelantos Pendiente/Aprobado ya solicitados.
-- ============================================================================

-- ---- Helper: comercio del usuario autenticado ----
create or replace function public.usuario_comercio_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select com.id
  from public.clientes c
  join public.comercios com on com.legajo = c.legajo
  where c.correo = auth.email()
  limit 1;
$$;

grant execute on function public.usuario_comercio_id() to authenticated;
grant execute on function public.usuario_comercio_id() to service_role;

-- ---- Columnas faltantes en adelantos (portal) ----
alter table public.adelantos add column if not exists motivo               text;
alter table public.adelantos add column if not exists fecha_acreditacion date;
alter table public.adelantos
  add column if not exists lote_acreditacion_id uuid
  references public.lotes_acreditacion (id) on update cascade on delete set null;
alter table public.adelantos add column if not exists monto_por_acreditar numeric;

-- ---- RLS: lotes del propio comercio ----
drop policy if exists lotes_comercio_select on public.lotes_acreditacion;
create policy lotes_comercio_select on public.lotes_acreditacion
  for select to authenticated
  using (comercio_id = public.usuario_comercio_id());

-- ---- RLS: adelantos del propio comercio (lectura) ----
drop policy if exists adelantos_comercio_select on public.adelantos;
create policy adelantos_comercio_select on public.adelantos
  for select to authenticated
  using (comercio_id = public.usuario_comercio_id());

-- ---- RLS: el comercio inserta adelantos solo sobre su comercio ----
drop policy if exists adelantos_comercio_insert on public.adelantos;
create policy adelantos_comercio_insert on public.adelantos
  for insert to authenticated
  with check (comercio_id = public.usuario_comercio_id());

-- ============================================================================
-- RPC ingresar_adelanto: alta con validación de disponible server-side.
-- ============================================================================
create or replace function public.ingresar_adelanto(
  monto numeric,
  fecha_acreditacion date default null,
  motivo text default null,
  lote_acreditacion_id uuid default null
)
returns public.adelantos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comercio_id uuid := public.usuario_comercio_id();
  v_pendiente  numeric;
  v_reservado  numeric;
  v_disponible numeric;
  v_plazo      int;
  v_row        public.adelantos;
begin
  if v_comercio_id is null then
    raise exception 'No se pudo identificar el comercio del usuario.';
  end if;

  if monto is null or monto <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;

  -- Pendiente de acreditación: importe_neto de lotes no resueltos.
  select coalesce(sum(l.importe_neto), 0)
    into v_pendiente
  from public.lotes_acreditacion l
  where l.comercio_id = v_comercio_id
    and l.estado is distinct from 'Acreditado'
    and l.estado is distinct from 'Rechazado';

  -- Adelantos Pendiente / Aprobado en curso (reservan disponible).
  select coalesce(sum(a.monto_solicitado), 0)
    into v_reservado
  from public.adelantos a
  where a.comercio_id = v_comercio_id
    and a.estado in ('Pendiente', 'Aprobado');

  v_disponible := v_pendiente - v_reservado;

  if monto > v_disponible then
    raise exception 'El monto (%) supera el disponible para adelanto (%).', monto, v_disponible;
  end if;

  v_plazo := greatest(1, coalesce((fecha_acreditacion - current_date)::int, 1));

  insert into public.adelantos
    (comercio_id, monto_solicitado, plazo_original_dias, plazo_adelantado_dias,
     tasa_interes_pct, estado, fecha_solicitud, fecha_acreditacion, motivo,
     lote_acreditacion_id, monto_por_acreditar)
  values
    (v_comercio_id, monto, 30, v_plazo, null, 'Pendiente', now(),
     fecha_acreditacion, motivo, lote_acreditacion_id, v_pendiente)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.ingresar_adelanto(numeric, date, text, uuid) to authenticated;
grant execute on function public.ingresar_adelanto(numeric, date, text, uuid) to service_role;