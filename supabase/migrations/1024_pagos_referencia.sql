-- Fase 6 de Ecart Pay: cobros por transferencia SPEI y efectivo OXXO.
-- El pagador recibe una referencia para pagar fuera del checkout: la CLABE única de la orden
-- (SPEI) o la referencia de pago en tienda (OXXO), con su vencimiento y, en OXXO, el código de
-- barras. Aditiva.
alter table public.pagos
  add column if not exists referencia text,
  add column if not exists referencia_vence_at timestamptz,
  add column if not exists referencia_url text;

comment on column public.pagos.referencia is
  'Referencia para pagar fuera del checkout: CLABE única (SPEI) o referencia OXXO.';
