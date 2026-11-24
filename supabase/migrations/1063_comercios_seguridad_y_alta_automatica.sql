-- 1) Seguridad: `comercios` tenía políticas abiertas (heredadas) que dejaban a cualquier usuario
--    con sesión leer, crear, modificar o borrar cualquier comercio. Ahora el cliente solo VE los
--    suyos (por legajo o por su correo); modificar queda para admins (comercios_admin_modify) y
--    el servidor (service role).
drop policy if exists authenticated_all_comercios on public.comercios;
drop policy if exists authenticated_read_comercios on public.comercios;
drop policy if exists comercios_select on public.comercios;
create policy comercios_select on public.comercios
  for select to authenticated
  using (
    public.is_admin()
    or legajo = public.current_cliente_legajo()
    or lower(usuario) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- 2) Alta automática: al aprobarse el KYC de un cliente se le crea su comercio (si no tiene),
--    para que pueda conectar sus cobros con tarjeta sin esperar a que un admin lo dé de alta.
--    El admin puede editarlo, deshabilitarlo o crear más.
create or replace function public._comercio_al_aprobar_kyc()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.estado_onboarding = 'aprobado'
     and (tg_op = 'INSERT' or old.estado_onboarding is distinct from 'aprobado')
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
  after insert or update of estado_onboarding on public.clientes
  for each row execute function public._comercio_al_aprobar_kyc();

-- Clientes ya aprobados sin comercio.
insert into public.comercios (usuario, legajo, estado, nivel, nombre_comercio)
select cl.correo, cl.legajo, 'Activado', 'Estándar',
       coalesce(nullif(btrim(cl.nombre_fantasia), ''), nullif(btrim(cl.nombre_legal), ''), cl.nombre)
  from public.clientes cl
 where cl.estado_onboarding = 'aprobado'
   and cl.correo is not null
   and not exists (select 1 from public.comercios c where c.legajo = cl.legajo);
