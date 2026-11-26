-- Personas del KYB (representante y beneficiarios): el cliente ya no las puede cambiar una vez
-- enviada o aprobada su alta como Subcliente (enviando / processing / approved). Si Cobre la
-- rechazó o falló, las puede corregir. El admin (is_admin) las edita siempre. Aditiva.
create or replace function public._kyb_personas_editables(p_legajo text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.is_admin() or not exists (
    select 1 from public.cobre_subclientes s
    where s.cliente_legajo = p_legajo and s.estado in ('enviando', 'processing', 'approved')
  );
$$;
revoke all on function public._kyb_personas_editables(text) from public, anon;
grant execute on function public._kyb_personas_editables(text) to authenticated;

drop policy if exists cliente_personas_kyb_congeladas_ins on public.cliente_personas_kyb;
create policy cliente_personas_kyb_congeladas_ins on public.cliente_personas_kyb
  as restrictive for insert to authenticated
  with check (public._kyb_personas_editables(cliente_legajo));
drop policy if exists cliente_personas_kyb_congeladas_upd on public.cliente_personas_kyb;
create policy cliente_personas_kyb_congeladas_upd on public.cliente_personas_kyb
  as restrictive for update to authenticated
  using (public._kyb_personas_editables(cliente_legajo))
  with check (public._kyb_personas_editables(cliente_legajo));
drop policy if exists cliente_personas_kyb_congeladas_del on public.cliente_personas_kyb;
create policy cliente_personas_kyb_congeladas_del on public.cliente_personas_kyb
  as restrictive for delete to authenticated
  using (public._kyb_personas_editables(cliente_legajo));
