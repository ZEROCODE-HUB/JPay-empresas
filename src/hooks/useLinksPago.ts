import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import {
  actualizarLinkPago,
  actualizarProducto,
  crearLinkPago,
  crearProducto,
  eliminarLinkPago,
  eliminarProducto,
  upsertIntegracionEcommerce,
  type LinkPagoConDetalle,
  type ProductoRow,
  getClienteActual,
  getDashboardLinksPago,
  listBanderasActivasComercio,
  listComerciosUsuario,
  listIntegracionesEcommerce,
  listLinksPago,
  listNombresBanderasComercio,
  listProductos,
} from "@/lib/api/links-pago";

// Las pantallas de links de pago cargaban una sola vez al montar; no se
// refrescan solas al volver a la pestaña.
const SIN_REFETCH_AUTO = { refetchOnWindowFocus: false, retry: false } as const;

export function useClienteActual() {
  return useQuery({
    queryKey: ["links-pago", "cliente-actual"],
    queryFn: getClienteActual,
    staleTime: 5 * 60_000,
    ...SIN_REFETCH_AUTO,
  });
}

export function useDashboardLinksPago(legajo: string | undefined, days: number) {
  return useQuery({
    queryKey: ["links-pago", "dashboard", legajo, days],
    queryFn: () => getDashboardLinksPago(legajo!, days),
    enabled: !!legajo,
    placeholderData: keepPreviousData,
    ...SIN_REFETCH_AUTO,
  });
}

export function useProductos(legajo: string | undefined) {
  return useQuery({
    queryKey: ["links-pago", "productos", legajo],
    queryFn: () => listProductos(legajo!),
    enabled: !!legajo,
    ...SIN_REFETCH_AUTO,
  });
}

export function useLinksPago(legajo: string | undefined) {
  return useQuery({
    queryKey: ["links-pago", "links", legajo],
    queryFn: () => listLinksPago(legajo!),
    enabled: !!legajo,
    ...SIN_REFETCH_AUTO,
  });
}

export function useComerciosUsuario(legajo: string | undefined, mail: string | undefined) {
  return useQuery({
    queryKey: ["links-pago", "comercios", legajo, mail],
    queryFn: () => listComerciosUsuario(legajo!, mail!),
    enabled: !!legajo && !!mail,
    ...SIN_REFETCH_AUTO,
  });
}

export function useBanderasActivasComercio(comercioId: string | undefined) {
  return useQuery({
    queryKey: ["links-pago", "banderas", comercioId],
    queryFn: () => listBanderasActivasComercio(comercioId!),
    enabled: !!comercioId,
    ...SIN_REFETCH_AUTO,
  });
}

export function useNombresBanderasComercio(comercioId: string | undefined) {
  return useQuery({
    queryKey: ["links-pago", "banderas-nombres", comercioId],
    queryFn: () => listNombresBanderasComercio(comercioId!),
    enabled: !!comercioId,
    ...SIN_REFETCH_AUTO,
  });
}

export function useIntegracionesEcommerce(legajo: string | undefined) {
  return useQuery({
    queryKey: ["links-pago", "ecommerce", legajo],
    queryFn: () => listIntegracionesEcommerce(legajo!),
    enabled: !!legajo,
    ...SIN_REFETCH_AUTO,
  });
}

// ============================================================================
// Mutaciones
// ============================================================================

export function useGuardarProducto(legajo: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id?: string; payload: TablesInsert<"productos"> }) =>
      vars.id ? actualizarProducto(vars.id, vars.payload) : crearProducto(vars.payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["links-pago", "productos", legajo] });
    },
  });
}

export function useEliminarProducto(legajo: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => eliminarProducto(id),
    onSuccess: (_, id) =>
      queryClient.setQueryData<ProductoRow[]>(["links-pago", "productos", legajo], (prev) =>
        prev?.filter((p) => p.id !== id),
      ),
  });
}

export function useCrearLinkPago() {
  return useMutation({
    mutationFn: (vars: {
      link: TablesInsert<"cliente_links_pago">;
      detalle: Omit<TablesInsert<"cliente_links_pago_detalle">, "link_id">[];
    }) => crearLinkPago(vars.link, vars.detalle),
  });
}

export function useActualizarLinkPago(legajo: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: TablesUpdate<"cliente_links_pago"> }) =>
      actualizarLinkPago(vars.id, vars.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["links-pago", "links", legajo] });
    },
  });
}

export function useEliminarLinkPago(legajo: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => eliminarLinkPago(id),
    onSuccess: (_, id) =>
      queryClient.setQueryData<LinkPagoConDetalle[]>(["links-pago", "links", legajo], (prev) =>
        prev?.filter((l) => l.id !== id),
      ),
  });
}

export function useUpsertIntegracionEcommerce(legajo: string | undefined) {
  return useMutation({
    mutationFn: (vars: {
      plataforma: string;
      patch: Omit<TablesInsert<"cliente_integraciones_ecommerce">, "cliente_legajo" | "plataforma">;
    }) => upsertIntegracionEcommerce(legajo!, vars.plataforma, vars.patch),
  });
}
