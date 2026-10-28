-- Estado de la conexión de la plataforma con cada proveedor de pagos (Fase 2 de Ecart Pay).
-- Lo escribe la Edge Function `ecartpay-salud` (service role) al probar la conexión;
-- el admin lo lee con la política de lectura pública de `proveedores_pago` (migración 1015).
-- Aditiva: solo agrega columnas con default.

alter table public.proveedores_pago
  add column if not exists conexion_estado text not null default 'sin_probar',
  add column if not exists conexion_verificada_at timestamptz,
  add column if not exists conexion_detalle jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'proveedores_pago_conexion_estado_check'
  ) then
    alter table public.proveedores_pago
      add constraint proveedores_pago_conexion_estado_check
      check (conexion_estado in ('sin_probar', 'ok', 'error'));
  end if;
end $$;

comment on column public.proveedores_pago.conexion_estado is
  'Resultado de la última prueba de conexión: sin_probar | ok | error.';
comment on column public.proveedores_pago.conexion_detalle is
  'Detalle de la última prueba (entorno, URL base, pasos, latencia). Nunca contiene credenciales.';
