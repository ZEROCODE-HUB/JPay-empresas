-- Fase 5 de Ecart Pay: cada 5 minutos se reconsultan los pagos abiertos por si se perdió un
-- aviso. La Edge Function `ecartpay-pendientes` es pública, no recibe datos y limita su propia
-- frecuencia (reservar_tarea), así que la llamada no lleva credenciales.
-- La URL es la del proyecto; en otro proyecto hay que ajustarla.

select cron.unschedule(jobid) from cron.job where jobname = 'ecartpay-pendientes';

select cron.schedule(
  'ecartpay-pendientes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ovbozgezuboftcjwxlwj.supabase.co/functions/v1/ecartpay-pendientes',
    headers := '{"content-type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
