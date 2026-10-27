import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { paymentMethods, type PaymentLink, type Product } from "@/data/links-pago";
import type { ClienteActual } from "@/lib/api/links-pago";
import {
  useBanderasActivasComercio,
  useComerciosUsuario,
  useCrearLinkPago,
} from "@/hooks/useLinksPago";
import { buildResolvableUrl } from "@/lib/pay-url";
import { formatDate } from "@/shared/format";
import {
  banderasUnicas as calcularBanderasUnicas,
  expiraEnIso,
  montoProductos,
  nuevoCodigoLink,
  type ComercioBandera,
} from "../utils";

const metodosHabilitados = () => paymentMethods.filter((m) => m.enabled).map((m) => m.id);

/** Formulario "Generar link de pago" a partir de los productos seleccionados. */
export function useGenerarLink({
  cliente,
  products,
  selected,
  onCreado,
  onRefrescar,
}: {
  cliente: ClienteActual | null | undefined;
  products: Product[];
  selected: string[];
  /** Se llama apenas se crea el link (antes de releer la lista). */
  onCreado: (link: PaymentLink) => void;
  onRefrescar: () => Promise<void>;
}) {
  const legajo = cliente?.legajo ?? "";
  const { data: userComercios = [] } = useComerciosUsuario(cliente?.legajo, cliente?.mail);
  const crearLink = useCrearLinkPago();

  const [open, setOpen] = useState(false);
  const [partial, setPartial] = useState(false);
  const [methods, setMethods] = useState<string[]>(metodosHabilitados);
  const [expires, setExpires] = useState("");
  const [status, setStatus] = useState<string>("Activo");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [comercioId, setComercioId] = useState<string>("");

  const { data: banderasComercio } = useBanderasActivasComercio(comercioId || undefined);
  const banderasUnicas = useMemo(
    () => (banderasComercio ? calcularBanderasUnicas(banderasComercio) : undefined),
    [banderasComercio],
  );
  const comercioBanderas: ComercioBandera[] = (comercioId && banderasUnicas) || [];

  // Al cargar las banderas del comercio elegido se preseleccionan todos sus métodos.
  useEffect(() => {
    if (banderasUnicas) setMethods(banderasUnicas.map((b) => b.methodId));
  }, [banderasUnicas]);

  const toggleMethod = (id: string) => {
    setMethods((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const abrir = () => {
    if (selected.length === 0) {
      toast.error("Selecciona productos primero");
      return;
    }
    setPartial(false);
    setMethods(metodosHabilitados());
    setExpires("");
    setStatus("Activo");
    setReference("");
    setNotes("");
    setOpen(true);
  };

  const cerrar = () => {
    setOpen(false);
    setComercioId("");
  };

  const generar = async () => {
    const selProducts = products.filter((p) => selected.includes(p.id));
    if (selProducts.length === 0) {
      toast.error("Selecciona al menos un producto");
      return;
    }
    if (!legajo) {
      toast.error("Sesion no disponible");
      return;
    }
    if (!comercioId) {
      toast.error("Selecciona un comercio");
      return;
    }
    const selectedComercio = userComercios.find((c) => c.id === comercioId);
    // URL resoluble real: VITE_APP_URL > VITE_PAY_URL > window.location.origin (ver @/lib/pay-url).
    const url = buildResolvableUrl(nuevoCodigoLink());
    const insertLink = {
      cliente_legajo: legajo,
      comercio_id: comercioId,
      comercio_nombre: selectedComercio?.nombre_comercio || "",
      url,
      monto: montoProductos(selProducts),
      estado: status,
      referencia: reference || null,
      notas: notes || null,
      expira_en: expiraEnIso(expires),
      pagos_parciales: partial,
      metodos_pago: methods,
    };
    let inserted: { id: string; detalleOk: boolean };
    try {
      inserted = await crearLink.mutateAsync({
        link: insertLink,
        detalle: selProducts.map((p) => ({
          producto_id: p.id,
          producto_nombre: p.name,
          cantidad: p.qty,
          precio_unitario: p.price,
        })),
      });
    } catch {
      toast.error("No se pudo generar el link");
      return;
    }
    if (!inserted.detalleOk) toast.error("Link creado, pero fallo el detalle");
    onCreado({
      id: inserted.id,
      url,
      products: selProducts,
      status: status as PaymentLink["status"],
      partialPayments: partial,
      methods,
      reference: reference || undefined,
      notes: notes || undefined,
      createdAt: formatDate(new Date()),
      expiresAt: expires || undefined,
      views: 0,
      payments: 0,
      comercioId,
      comercioNombre: selectedComercio?.nombre_comercio ?? undefined,
    });
    setOpen(false);
    setReference("");
    setNotes("");
    setExpires("");
    setPartial(false);
    setMethods([]);
    setStatus("Activo");
    setComercioId("");
    toast.success("Link generado con exito");
    await onRefrescar();
  };

  return {
    open,
    abrir,
    cerrar,
    generar,
    userComercios,
    comercioId,
    setComercioId,
    comercioBanderas,
    partial,
    setPartial,
    methods,
    toggleMethod,
    expires,
    setExpires,
    status,
    setStatus,
    reference,
    setReference,
    notes,
    setNotes,
  };
}

export type GenerarLink = ReturnType<typeof useGenerarLink>;
