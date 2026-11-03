-- Estados válidos para los tipos de movimiento de México que se listan en el admin
-- (Movimientos → Transferencias y Conversiones a dólares): mismos que un retiro, más PENDIENTE
-- para las transferencias que esperan aprobación. Aditiva.
insert into public.estados_por_tipo (tipo_movimiento, estado_id)
select v.tipo, e.id
  from (values ('transferencia', 'APROBADO'), ('transferencia', 'EN_PROGRESO'),
               ('transferencia', 'RECHAZADO'), ('transferencia', 'BLOQUEADO'),
               ('transferencia', 'PENDIENTE'),
               ('conversion', 'APROBADO'), ('conversion', 'EN_PROGRESO'),
               ('conversion', 'RECHAZADO')) v(tipo, codigo)
  join public.estados_movimiento e on e.codigo = v.codigo
 where not exists (select 1 from public.estados_por_tipo x
                    where x.tipo_movimiento = v.tipo and x.estado_id = e.id);
