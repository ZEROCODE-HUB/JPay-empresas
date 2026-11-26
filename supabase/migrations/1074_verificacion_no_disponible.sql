-- La verificación de titular de CLABE (`mex_acc_ownership_1`) no está habilitada en todas las
-- cuentas de Cobre (error G005). Sin ella el destinatario queda `no_disponible` y se puede pagar;
-- se reintenta cada 24 h por si Cobre la habilita después.
alter table public.cobre_contrapartes drop constraint cobre_contrapartes_verificacion_check;
alter table public.cobre_contrapartes add constraint cobre_contrapartes_verificacion_check
  check (verificacion = any (array['sin_verificar','procesando','matched','unmatched','unresolved',
    'verified','rejected','failed','no_disponible']));
