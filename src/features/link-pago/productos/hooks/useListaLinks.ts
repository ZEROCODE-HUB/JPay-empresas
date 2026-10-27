import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { PaymentLink } from "@/data/links-pago";
import {
  useActualizarLinkPago,
  useEliminarLinkPago,
  useLinksPago,
  useNombresBanderasComercio,
} from "@/hooks/useLinksPago";
import { expiraEnIso, filtrarLinks, toPaymentLink } from "../utils";

export type EdicionLink = {
  status: string;
  reference?: string;
  notes?: string;
  expires?: string;
  partial: boolean;
  methods: string[];
};

/** Links de pago generados: listado, paginación, detalle, edición y baja. */
export function useListaLinks(legajo: string | undefined) {
  const linksQuery = useLinksPago(legajo);
  const actualizarLink = useActualizarLinkPago(legajo);
  const eliminarLink = useEliminarLinkPago(legajo);

  // Link recién generado que se muestra arriba mientras se relee la lista.
  const [recienCreados, setRecienCreados] = useState<PaymentLink[]>([]);
  const links = useMemo(
    () => [...recienCreados, ...(linksQuery.data ?? []).map(toPaymentLink)],
    [recienCreados, linksQuery.data],
  );
  const [page, setPage] = useState(1);
  const [busqueda, setBusquedaState] = useState("");
  const linksFiltrados = useMemo(() => filtrarLinks(links, busqueda), [links, busqueda]);
  const setBusqueda = (v: string) => {
    setBusquedaState(v);
    setPage(1);
  };
  const [detailLink, setDetailLink] = useState<PaymentLink | null>(null);
  const [editLink, setEditLink] = useState<PaymentLink | null>(null);
  const [confirmarEliminarId, setConfirmarEliminarId] = useState<string | null>(null);
  const { data: detailLinkBanderas = [] } = useNombresBanderasComercio(detailLink?.comercioId);

  /** Muestra el link recién creado en la primera página hasta que llegue la lista nueva. */
  const mostrarRecienCreado = (link: PaymentLink) => {
    setRecienCreados([link]);
    setPage(1);
  };
  const refrescar = async () => {
    await linksQuery.refetch();
    setRecienCreados([]);
  };

  const deleteLink = async (id: string) => {
    try {
      await eliminarLink.mutateAsync(id);
    } catch {
      toast.error("No se pudo eliminar");
      return;
    }
    setRecienCreados((prev) => prev.filter((l) => l.id !== id));
    toast.success("Link de pago eliminado");
  };

  const saveEditLink = async (id: string, vals: EdicionLink) => {
    try {
      await actualizarLink.mutateAsync({
        id,
        patch: {
          estado: vals.status,
          referencia: vals.reference || null,
          notas: vals.notes || null,
          expira_en: expiraEnIso(vals.expires ?? ""),
          pagos_parciales: vals.partial,
          metodos_pago: vals.methods,
        },
      });
    } catch {
      toast.error("No se pudo actualizar el link");
      return;
    }
    toast.success("Link de pago actualizado");
    setEditLink(null);
  };

  return {
    links,
    linksFiltrados,
    busqueda,
    setBusqueda,
    page,
    setPage,
    detailLink,
    setDetailLink,
    detailLinkBanderas,
    editLink,
    setEditLink,
    confirmarEliminarId,
    setConfirmarEliminarId,
    mostrarRecienCreado,
    refrescar,
    deleteLink,
    saveEditLink,
  };
}

export type ListaLinks = ReturnType<typeof useListaLinks>;
