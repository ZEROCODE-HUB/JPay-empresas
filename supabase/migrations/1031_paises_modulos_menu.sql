-- Módulos por país para armar los menús del admin y del portal (Fase 6).
-- Suma las claves nuevas sin pisar las que ya existen (si el admin cambió alguna, se respeta).
--   pagos_proveedor:          cobros con un proveedor conectado por OAuth (Ecart Pay).
--   retiros_proveedor:        consulta de retiros del comercio en el proveedor.
--   payway:                   tarjetas con Payway y conciliaciones BLP.
--   transferencias_salientes: transferencias por BDC / Coelsa.
-- Aditiva.

update public.paises
set modulos = '{"pagos_proveedor":true,"retiros_proveedor":true,"payway":false,
                "transferencias_salientes":false}'::jsonb || modulos,
    updated_at = now()
where codigo = 'MX';

update public.paises
set modulos = '{"pagos_proveedor":false,"retiros_proveedor":false,"payway":true,
                "transferencias_salientes":true}'::jsonb || modulos,
    updated_at = now()
where codigo = 'AR';
