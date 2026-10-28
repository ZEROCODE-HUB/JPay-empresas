-- Fase 8 de Ecart Pay: contracargos.
-- Llegan por webhook (`chargebacks.create` / `chargebacks.update`) y solo se registran desde
-- avisos con firma válida (no hay otra forma documentada de consultarlos). `vence_at` es el
-- plazo para presentar pruebas (`expiration_at`). No reemplaza a `contracargos` (Payway/AR).
-- Aditiva.

create table if not exists public.contracargos_proveedor (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null references public.proveedores_pago (codigo) on update cascade,
  id_externo text not null,
  pago_id uuid references public.pagos (id) on delete set null,
  cliente_legajo text,
  orden_id text,
  transaccion_id text,
  monto numeric(14, 2),
  moneda text,
  motivo text,
  estado text not null,
  vence_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proveedor, id_externo)
);
create index if not exists contracargos_proveedor_pago_idx on public.contracargos_proveedor (pago_id);

alter table public.contracargos_proveedor enable row level security;
revoke all on public.contracargos_proveedor from anon;
revoke insert, update, delete on public.contracargos_proveedor from authenticated;
grant select on public.contracargos_proveedor to authenticated;
drop policy if exists contracargos_proveedor_select on public.contracargos_proveedor;
create policy contracargos_proveedor_select on public.contracargos_proveedor
  for select to authenticated using (
    public.es_backoffice() or cliente_legajo = public.current_cliente_legajo()
  );

comment on table public.contracargos_proveedor is
  'Contracargos avisados por el proveedor (webhooks firmados). Estados: created, pending, in_review, won, lost.';
