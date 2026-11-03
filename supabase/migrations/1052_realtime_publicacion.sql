-- Tiempo real: la publicación `supabase_realtime` solo tenía `contracargos`, así que las
-- pantallas suscriptas a cambios (Movimientos, inicio del admin, cobros del portal) no recibían
-- nada y dependían de recargar. Se agregan las tablas que esas pantallas escuchan. Realtime
-- respeta las políticas RLS de cada tabla (cada usuario solo recibe lo que puede leer).
-- Aditiva.
do $$
declare
  t text;
begin
  foreach t in array array[
    'transactions', 'pagos', 'alerts', 'clientes', 'cobros_recurrentes', 'suscripciones',
    'domiciliaciones', 'cobre_transferencias', 'cobre_depositos', 'cobre_cobros_r2p'
  ] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
