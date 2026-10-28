-- Fase 8 de Ecart Pay: reembolsos.
--
-- Nunca se reembolsa dos veces lo mismo: `reservar_reembolso` bloquea el pago y verifica que lo
-- ya reembolsado (aprobado o en curso) más lo pedido no supere el monto cobrado, ANTES de llamar
-- al proveedor. `finalizar_reembolso` cierra la reserva (aprobado o error) y recalcula
-- `pagos.monto_reembolsado`. Ambas solo para el service role (Edge Function
-- `ecartpay-reembolsos`). Aditiva.

alter table public.pagos
  add column if not exists monto_reembolsado numeric(14, 2) not null default 0;

create table if not exists public.reembolsos (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references public.pagos (id) on delete restrict,
  proveedor text not null references public.proveedores_pago (codigo) on update cascade,
  proveedor_reembolso_id text,
  monto numeric(14, 2) not null check (monto > 0),
  motivo text not null check (motivo in ('requested', 'duplicate', 'fraudulent')),
  nota text,
  estado text not null default 'solicitado'
    check (estado in ('solicitado', 'aprobado', 'error')),
  origen text not null check (origen in ('comercio', 'admin')),
  solicitado_por uuid,
  respuesta jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  finalizado_at timestamptz
);
create index if not exists reembolsos_pago_idx on public.reembolsos (pago_id);

alter table public.reembolsos enable row level security;
revoke all on public.reembolsos from anon;
revoke insert, update, delete on public.reembolsos from authenticated;
grant select on public.reembolsos to authenticated;
drop policy if exists reembolsos_select on public.reembolsos;
create policy reembolsos_select on public.reembolsos for select to authenticated using (
  public.es_backoffice()
  or pago_id in (
    select p.id from public.pagos p where p.cliente_legajo = public.current_cliente_legajo()
  )
);

create or replace function public.reservar_reembolso(
  p_pago_id uuid,
  p_monto numeric,
  p_motivo text,
  p_nota text,
  p_origen text,
  p_usuario uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v public.pagos;
  v_comprometido numeric;
  v_id uuid;
begin
  select * into v from public.pagos where id = p_pago_id for update;
  if not found then
    raise exception 'Pago inexistente' using errcode = 'P0002';
  end if;
  if v.estado not in ('pagado', 'parcialmente_reembolsado') then
    raise exception 'Solo se reembolsan pagos cobrados (estado actual: %)', v.estado
      using errcode = '22023';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto <> round(p_monto, 2) then
    raise exception 'Monto inválido' using errcode = '22023';
  end if;
  select coalesce(sum(monto), 0) into v_comprometido
  from public.reembolsos
  where pago_id = p_pago_id and estado in ('solicitado', 'aprobado');
  if v_comprometido + p_monto > v.monto then
    raise exception 'El reembolso supera lo disponible (%)', v.monto - v_comprometido
      using errcode = '22023';
  end if;
  insert into public.reembolsos (pago_id, proveedor, monto, motivo, nota, origen, solicitado_por)
  values (p_pago_id, v.proveedor, p_monto, p_motivo, p_nota, p_origen, p_usuario)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.finalizar_reembolso(
  p_reembolso_id uuid,
  p_ok boolean,
  p_proveedor_reembolso_id text default null,
  p_respuesta jsonb default null,
  p_error text default null
)
returns public.reembolsos
language plpgsql
security definer
set search_path to ''
as $$
declare
  r public.reembolsos;
begin
  update public.reembolsos set
    estado = case when p_ok then 'aprobado' else 'error' end,
    proveedor_reembolso_id = coalesce(p_proveedor_reembolso_id, proveedor_reembolso_id),
    respuesta = coalesce(p_respuesta, respuesta),
    error = case when p_ok then null else p_error end,
    finalizado_at = now()
  where id = p_reembolso_id and estado = 'solicitado'
  returning * into r;
  if not found then
    raise exception 'Reembolso % inexistente o ya finalizado', p_reembolso_id;
  end if;
  update public.pagos set
    monto_reembolsado = (
      select coalesce(sum(monto), 0) from public.reembolsos
      where pago_id = r.pago_id and estado = 'aprobado'
    ),
    updated_at = now()
  where id = r.pago_id;
  return r;
end;
$$;

revoke execute on function
  public.reservar_reembolso(uuid, numeric, text, text, text, uuid),
  public.finalizar_reembolso(uuid, boolean, text, jsonb, text)
from public, anon, authenticated;
grant execute on function
  public.reservar_reembolso(uuid, numeric, text, text, text, uuid),
  public.finalizar_reembolso(uuid, boolean, text, jsonb, text)
to service_role;
