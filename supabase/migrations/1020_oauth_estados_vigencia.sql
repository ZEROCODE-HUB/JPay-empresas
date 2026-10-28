-- El comercio puede tener que completar la verificación (KYC) de Ecart Pay en medio del flujo
-- OAuth, y eso tarda más de 10 minutos. El state pasa a vencer a los 60 minutos (sigue siendo
-- de un solo uso; el `code` de Ecart Pay vence igual a los 5 minutos de emitido).
alter table public.oauth_estados alter column vence_at set default now() + interval '60 minutes';

comment on table public.oauth_estados is
  'State de OAuth por intento de conexión con un proveedor. Un solo uso; vence en 60 minutos.';
