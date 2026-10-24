-- ============================================================================
-- 1009_fix_rls_admin_kyc.sql  (el portal de empresas)
-- Corrige la regresion de seguridad de la migracion 1004:
--   - Elimina 5 politicas USING(true) que abrian todos los datos a cualquier
--     usuario autenticado (clientes, documentos, validaciones).
--   - Las politicas admin-gated de el panel de administración (0005, 0010, 0011) ya cubren
--     al admin con is_admin(). Este archivo agrega las politicas client-scoped
--     para que cada usuario vea sus propios documentos y validaciones.
-- ============================================================================

-- ---- 1. Eliminar politicas peligrosas de 1004 (USING true) ----

DROP POLICY IF EXISTS clientes_admin_select ON public.clientes;
DROP POLICY IF EXISTS clientes_admin_update ON public.clientes;
DROP POLICY IF EXISTS documentos_admin_select ON public.documentos;
DROP POLICY IF EXISTS validaciones_admin_select ON public.validaciones;
DROP POLICY IF EXISTS validaciones_admin_update ON public.validaciones;

-- ---- 2. Politicas client-scoped: documentos ----
-- El cliente ve sus propios documentos (DNI, selfie, servicio, etc.)

DROP POLICY IF EXISTS documentos_cliente_select ON public.documentos;
CREATE POLICY documentos_cliente_select ON public.documentos
  FOR SELECT TO authenticated
  USING (
    cliente_legajo = (
      SELECT c.legajo FROM public.clientes c WHERE c.correo = auth.email()
    )
  );

-- ---- 3. Politicas client-scoped: validaciones ----
-- El cliente ve el estado de sus propias validaciones KYC

DROP POLICY IF EXISTS validaciones_cliente_select ON public.validaciones;
CREATE POLICY validaciones_cliente_select ON public.validaciones
  FOR SELECT TO authenticated
  USING (
    cliente_legajo = (
      SELECT c.legajo FROM public.clientes c WHERE c.correo = auth.email()
    )
  );
