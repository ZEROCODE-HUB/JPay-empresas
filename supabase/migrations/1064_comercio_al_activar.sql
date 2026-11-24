-- El alta automática del comercio (1063) escuchaba solo `estado_onboarding = 'aprobado'`, pero en
-- el admin la aprobación es la transición de `estado` a «activado» (onboarding puede seguir
-- «pendiente»). Ahora se crea con cualquiera de las dos. Y se crea para los activos que no tengan.
create or replace function public._comercio_al_aprobar_kyc()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if (
       (new.estado_onboarding = 'aprobado'
        and (tg_op = 'INSERT' or old.estado_onboarding is distinct from 'aprobado'))
    or (lower(new.estado) in ('activado', 'activo')
        and (tg_op = 'INSERT' or lower(coalesce(old.estado, '')) not in ('activado', 'activo')))
     )
     and new.correo is not null
     and not exists (select 1 from public.comercios c where c.legajo = new.legajo) then
    insert into public.comercios (usuario, legajo, estado, nivel, nombre_comercio)
    values (
      new.correo, new.legajo, 'Activado', 'Estándar',
      coalesce(nullif(btrim(new.nombre_fantasia), ''), nullif(btrim(new.nombre_legal), ''), new.nombre)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comercio_al_aprobar_kyc on public.clientes;
create trigger trg_comercio_al_aprobar_kyc
  after insert or update of estado_onboarding, estado on public.clientes
  for each row execute function public._comercio_al_aprobar_kyc();

insert into public.comercios (usuario, legajo, estado, nivel, nombre_comercio)
select cl.correo, cl.legajo, 'Activado', 'Estándar',
       coalesce(nullif(btrim(cl.nombre_fantasia), ''), nullif(btrim(cl.nombre_legal), ''), cl.nombre)
  from public.clientes cl
 where (cl.estado_onboarding = 'aprobado' or lower(cl.estado) in ('activado', 'activo'))
   and cl.correo is not null
   and not exists (select 1 from public.comercios c where c.legajo = cl.legajo);
