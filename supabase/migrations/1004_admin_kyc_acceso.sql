-- ============================================================================
-- 1004_admin_kyc_acceso.sql  (el portal de empresas)
-- Permite al panel de administracion (usuario autenticado) leer y resolver los
-- legajos KYC y sus documentos. En este prototipo no hay separacion de rol de
-- admin, por lo que cualquier usuario autenticado puede revisar legajos.
-- Ajustar con un rol/flag dedicado cuando exista gestion de roles.
-- ============================================================================

ALTER TABLE public.clientes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validaciones ENABLE ROW LEVEL SECURITY;

-- Lectura (el admin revisa todos los legajos)
DROP POLICY IF EXISTS clientes_admin_select ON public.clientes;
CREATE POLICY clientes_admin_select ON public.clientes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS documentos_admin_select ON public.documentos;
CREATE POLICY documentos_admin_select ON public.documentos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS validaciones_admin_select ON public.validaciones;
CREATE POLICY validaciones_admin_select ON public.validaciones
  FOR SELECT TO authenticated USING (true);

-- Resolucion (aprobar / rechazar)
DROP POLICY IF EXISTS clientes_admin_update ON public.clientes;
CREATE POLICY clientes_admin_update ON public.clientes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS validaciones_admin_update ON public.validaciones;
CREATE POLICY validaciones_admin_update ON public.validaciones
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
