import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getClaveIntegracionEcommerce, type IntegracionEcommerceRow } from "@/lib/api/links-pago";
import {
  useClienteActual,
  useIntegracionesEcommerce,
  useUpsertIntegracionEcommerce,
} from "@/hooks/useLinksPago";
import { conEstadoLocal, ECOMS, mergeIntegraciones, type Ecom } from "../utils";

/** Integraciones de e-commerce del cliente: lista paginada, alta/baja y claves. */
export function useIntegracionesEcom() {
  const queryClient = useQueryClient();
  const { data: cliente } = useClienteActual();
  const legajo = cliente?.legajo ?? "";
  const integraciones = useIntegracionesEcommerce(cliente?.legajo);
  const upsertIntegracion = useUpsertIntegracionEcommerce(cliente?.legajo);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [claveModal, setClaveModal] = useState<{ id: string; name: string } | null>(null);
  const [claveApi, setClaveApi] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const list = useMemo<Ecom[]>(
    () => mergeIntegraciones(ECOMS, integraciones.data ?? []),
    [integraciones.data],
  );

  // Cambio local inmediato del estado (la lista se vuelve a leer de la base solo con ACTUALIZAR).
  const setEstadoLocal = (plataforma: string, estado: Ecom["estado"]) => {
    queryClient.setQueryData<IntegracionEcommerceRow[]>(
      ["links-pago", "ecommerce", cliente?.legajo],
      (prev = []) => conEstadoLocal(prev, plataforma, estado, legajo),
    );
  };

  const totalPages = Math.ceil(list.length / pageSize);
  const paginated = useMemo(
    () => list.slice(page * pageSize, (page + 1) * pageSize),
    [list, page, pageSize],
  );

  const upsert = async (
    plataforma: string,
    patch: { estado: string; api_key?: string; webhook_url?: string },
  ): Promise<boolean> => {
    if (!legajo) return false;
    try {
      await upsertIntegracion.mutateAsync({ plataforma, patch });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la integración");
      return false;
    }
  };

  const toggleEstado = (id: string) => {
    const e = list.find((x) => x.id === id);
    if (!e) return;
    const nuevo = e.estado === "Habilitado" ? "Deshabilitado" : "Habilitado";
    setEstadoLocal(id, nuevo);
    void upsert(id, { estado: nuevo }).then((ok) => {
      if (ok) toast.success(`${e.name} ${nuevo === "Habilitado" ? "habilitada" : "deshabilitada"}`);
      else setEstadoLocal(id, e.estado);
    });
  };

  const refreshList = () => {
    setRefreshing(true);
    setTimeout(async () => {
      if (legajo) await integraciones.refetch();
      setRefreshing(false);
      toast.success("Catalogo de integraciones actualizado");
    }, 600);
  };

  const openClaveModal = (id: string, name: string) => {
    if (legajo) {
      (async () => {
        const data = await getClaveIntegracionEcommerce(legajo, id);
        setClaveApi(data?.api_key ?? "");
        setWebhookUrl(data?.webhook_url ?? "");
        setClaveModal({ id, name });
      })();
    } else {
      setClaveApi("");
      setWebhookUrl("");
      setClaveModal({ id, name });
    }
  };

  const connectIntegration = async (id: string, name: string, apiKey: string, webhook: string) => {
    if (!apiKey.trim()) {
      toast.error("La API Key es requerida");
      return;
    }
    if (!(await upsert(id, { estado: "Habilitado", api_key: apiKey, webhook_url: webhook })))
      return;
    setEstadoLocal(id, "Habilitado");
    setClaveModal(null);
    toast.success(`${name} conectada correctamente`);
  };

  return {
    list,
    paginated,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    refreshing,
    refreshList,
    toggleEstado,
    openClaveModal,
    claveModal,
    setClaveModal,
    claveApi,
    setClaveApi,
    webhookUrl,
    setWebhookUrl,
    connectIntegration,
  };
}

export type IntegracionesEcom = ReturnType<typeof useIntegracionesEcom>;
