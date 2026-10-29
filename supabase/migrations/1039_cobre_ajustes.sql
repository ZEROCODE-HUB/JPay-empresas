-- Ajustes de la integración con Cobre (Solution Design, fases D1–D7).
-- - `cobre_subclientes.balance_pedido_at`: marca quién pidió el Cobre Balance del comercio al
--   aprobarse el Subcliente (aviso y consulta periódica pueden llegar a la vez; solo uno lo crea).
-- Aditiva.

alter table public.cobre_subclientes
  add column if not exists balance_pedido_at timestamptz;

-- Avisos de instancias Cobre propias de un comercio (null = instancia matriz o el resto de proveedores).
alter table public.webhook_eventos
  add column if not exists instancia_id uuid;

-- Lotes con aprobación de admin (sobre `monto_aprobacion`, por el total del lote).
alter table public.cobre_lotes
  add column if not exists requiere_aprobacion boolean not null default false,
  add column if not exists decidida_por text,
  add column if not exists decidida_at timestamptz,
  add column if not exists nota_decision text;

-- Saldo que debería tener en Cobre el Balance de un comercio según JPay: lo que JPay le debe
-- (subcuentas en pesos, disponible + retenido) más las comisiones e IVA que JPay le cobró en
-- operaciones de Cobre y que físicamente siguen en ese Balance (todavía no se barren a JPay).
-- La conciliación le resta los envíos ya debitados en Cobre que JPay aún no cerró.
create or replace function public.cobre_saldo_esperado_comercio(p_legajo text)
returns numeric
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select sum(b.saldo_disponible + b.saldo_retenido)
      from public.subaccounts s join public.subaccount_balances b on b.subaccount_id = s.id
     where s.cliente_legajo = p_legajo and coalesce(s.moneda, 'MXN') = 'MXN'
       and exists (select 1 from public.ledger_accounts la where la.subaccount_id = s.id and la.currency_code = 'MXN')
  ), 0)
  + coalesce((
    select sum(t.comision + t.impuesto)
      from public.transactions t
     where t.legajo = p_legajo and t.ledger_status = 'posted' and t.currency_code = 'MXN'
       and (t.id_txn like 'COBRE-%'
            or t.id_txn in (select ct.id_txn from public.cobre_transferencias ct
                             where ct.cliente_legajo = p_legajo and ct.moneda = 'MXN'))
  ), 0);
$$;
revoke all on function public.cobre_saldo_esperado_comercio(text) from public, anon, authenticated;
grant execute on function public.cobre_saldo_esperado_comercio(text) to service_role;
