import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, Copy, Share2, Edit3, Search, Eye, Trash2, X } from "lucide-react";
import {
  Card,
  Input,
  Label,
  BtnPrimary,
  BtnOutline,
  Badge,
  PageHeader,
} from "@/components/portal-shell";
import { toast } from "sonner";
import { FormDialog } from "@/components/form-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { paymentMethods, type Product, type PaymentLink } from "@/data/links-pago";
import { formatDate, formatMoney } from "@/shared/format";
import { requireSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { buildResolvableUrl, toResolvableLinkPagoUrl } from "@/lib/pay-url";

export const Route = createFileRoute("/app/link-pago/productos")({ component: Page });

type DbProducto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  cantidad: number;
};

type DbLink = Tables<"cliente_links_pago">;

type DbLinkDetalle = {
  id: string;
  link_id: string;
  producto_id: string | null;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
};

type ComercioBandera = {
  id: string;
  bandera: string;
  estado: string;
  metodo_key: string | null;
  methodId: string;
};

/**
 * Normaliza el texto de una bandera al id de método que usa el checkout.
 * Solo se usa como fallback cuando `comercio_banderas.metodo_key` viene null.
 */
const BANDERA_FALLBACK_METHOD: Record<string, string> = {
  visa: "visa-cred",
  "visa crédito": "visa-cred",
  "visa débito": "visa-deb",
  "visa prepaga": "visa-deb",
  mastercard: "mc-cred",
  "mastercard crédito": "mc-cred",
  "mastercard débito": "mc-deb",
  "mastercard prepaga": "mc-deb",
  amex: "amex",
  "american express": "amex",
  cabal: "cabal-cred",
  "cabal crédito": "cabal-cred",
  "cabal débito": "cabal-deb",
  naranja: "naranja",
  "naranja x": "naranja",
  diners: "diners",
  maestro: "maestro",
};

function methodIdFromBandera(bandera: string): string {
  const key = bandera.trim().toLowerCase();
  return BANDERA_FALLBACK_METHOD[key] ?? key.replace(/\s+/g, "_");
}

function linkDisplayStatus(l: PaymentLink): string {
  if (l.status === "Activo" && l.expiresAt) {
    const parts = l.expiresAt.split("/");
    if (parts.length === 3) {
      const exp = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T23:59:59`);
      if (exp.getTime() < Date.now()) return "Vencido";
    }
  }
  return l.status;
}

function Page() {
  const [legajo, setLegajo] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [confirmarEliminarId, setConfirmarEliminarId] = useState<string | null>(null);
  const [confirmarEliminarLinkId, setConfirmarEliminarLinkId] = useState<string | null>(null);
  const [tab, setTab] = useState<"productos" | "links">("productos");
  const [detailLink, setDetailLink] = useState<PaymentLink | null>(null);
  const [detailLinkBanderas, setDetailLinkBanderas] = useState<string[]>([]);
  const [editLink, setEditLink] = useState<PaymentLink | null>(null);
  const [linksPage, setLinksPage] = useState(1);
  const LINKS_PAGE_SIZE = 10;

  const [linkPartial, setLinkPartial] = useState(false);
  const [linkMethods, setLinkMethods] = useState<string[]>(
    paymentMethods.filter((m) => m.enabled).map((m) => m.id),
  );
  const [linkExpires, setLinkExpires] = useState("");
  const [linkStatus, setLinkStatus] = useState<string>("Activo");
  const [linkRef, setLinkRef] = useState("");
  const [linkNotes, setLinkNotes] = useState("");
  const [userComercios, setUserComercios] = useState<
    { id: string; nombre_comercio: string | null }[]
  >([]);
  const [selectedComercioId, setSelectedComercioId] = useState<string>("");
  const [comercioBanderas, setComercioBanderas] = useState<ComercioBandera[]>([]);

  const loadProductos = async (lg: string) => {
    const s = requireSupabase();
    const { data } = await s
      .from("productos")
      .select("*")
      .eq("cliente_legajo", lg)
      .order("created_at", { ascending: false });
    const rows: Product[] = (data ?? []).map((r: DbProducto) => ({
      id: r.id,
      name: r.nombre,
      qty: Number(r.cantidad ?? 1),
      price: Number(r.precio ?? 0),
      desc: r.descripcion ?? undefined,
    }));
    setProducts(rows);
  };

  const loadLinks = async (lg: string) => {
    const s = requireSupabase();
    const { data: lks } = await s
      .from("cliente_links_pago")
      .select("*")
      .eq("cliente_legajo", lg)
      .order("created_at", { ascending: false });
    const lk = lks ?? [];
    const ids = lk.map((x: DbLink) => x.id);
    let det: DbLinkDetalle[] = [];
    if (ids.length) {
      const { data: d } = await s.from("cliente_links_pago_detalle").select("*").in("link_id", ids);
      det = d ?? [];
    }
    const byLink = new Map<string, DbLinkDetalle[]>();
    det.forEach((d) => {
      const arr = byLink.get(d.link_id) ?? [];
      arr.push(d);
      byLink.set(d.link_id, arr);
    });
    const rows: PaymentLink[] = lk.map((x: DbLink) => {
      const dd = byLink.get(x.id) ?? [];
      const prods: Product[] = dd.map((d) => ({
        id: d.producto_id ?? d.id,
        name: d.producto_nombre,
        qty: Number(d.cantidad ?? 1),
        price: Number(d.precio_unitario ?? 0),
      }));
      return {
        id: x.id,
        // La URL guardada puede ser branding (brand.web.payLinksBase) o un origen
        // viejo (localhost). Se reconstruye con el dominio de producción para
        // que "Copiar" y el detalle apunten siempre al deploy.
        url: toResolvableLinkPagoUrl(x.url ?? ""),
        products: prods,
        status: (x.estado ?? "Activo") as PaymentLink["status"],
        partialPayments: !!x.pagos_parciales,
        methods: Array.isArray(x.metodos_pago)
          ? x.metodos_pago.filter((m): m is string => typeof m === "string")
          : [],
        reference: x.referencia ?? undefined,
        notes: x.notas ?? undefined,
        createdAt: (x.created_at ?? "").slice(0, 10).split("-").reverse().join("/"),
        expiresAt: x.expira_en
          ? (x.expira_en as string).slice(0, 10).split("-").reverse().join("/")
          : undefined,
        views: Number(x.vistas ?? 0),
        payments: Number(x.pagos ?? 0),
        comercioId: x.comercio_id ?? undefined,
        comercioNombre: x.comercio_nombre ?? undefined,
      };
    });
    setLinks(rows);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = requireSupabase();
        const { data: u } = await s.auth.getUser();
        const mail = u.user?.email;
        if (!mail) return;
        const { data: cli } = await s
          .from("clientes")
          .select("legajo")
          .eq("correo", mail)
          .maybeSingle();
        if (!cli) return;
        if (cancelled) return;
        setLegajo(cli.legajo);
        await loadProductos(cli.legajo);
        await loadLinks(cli.legajo);
        const { data: com } = await s
          .from("comercios")
          .select("id, nombre_comercio")
          .or(`legajo.eq.${cli.legajo},usuario.eq.${mail}`);
        if (!cancelled) setUserComercios(com ?? []);
      } catch {
        // silencioso
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedComercioId) {
      setComercioBanderas([]);
      return;
    }
    const s = requireSupabase();
    s.from("comercio_banderas")
      .select("id, bandera, estado, metodo_key")
      .eq("comercio_id", selectedComercioId)
      .eq("estado", "Activo")
      .then(({ data }) => {
        const rows = (
          (data ?? []) as {
            id: string;
            bandera: string;
            estado: string;
            metodo_key: string | null;
          }[]
        ).map((b) => ({
          ...b,
          methodId: b.metodo_key || methodIdFromBandera(b.bandera),
        }));

        // Un comercio puede tener varias filas que apuntan al mismo metodo
        // (ej. "Visa" y "Visa Crédito" -> visa-cred). Se muestra una sola vez.
        const byMethod = new Map<string, ComercioBandera>();
        rows.forEach((b) => {
          if (!byMethod.has(b.methodId)) byMethod.set(b.methodId, b);
        });
        const unique = Array.from(byMethod.values());

        setComercioBanderas(unique);
        setLinkMethods(unique.map((b) => b.methodId));
      });
  }, [selectedComercioId]);

  useEffect(() => {
    if (!detailLink?.comercioId) {
      setDetailLinkBanderas([]);
      return;
    }
    const s = requireSupabase();
    s.from("comercio_banderas")
      .select("id, bandera")
      .eq("comercio_id", detailLink.comercioId)
      .eq("estado", "Activo")
      .then(({ data }) => {
        setDetailLinkBanderas((data ?? []).map((b: { bandera: string }) => b.bandera));
      });
  }, [detailLink?.comercioId]);

  const toggleMethod = (id: string) => {
    setLinkMethods((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const generateLink = async () => {
    const s = requireSupabase();
    const selProducts = products.filter((p) => selected.includes(p.id));
    if (selProducts.length === 0) {
      toast.error("Selecciona al menos un producto");
      return;
    }
    if (!legajo) {
      toast.error("Sesion no disponible");
      return;
    }
    if (!selectedComercioId) {
      toast.error("Selecciona un comercio");
      return;
    }
    const selectedComercio = userComercios.find((c) => c.id === selectedComercioId);
    const code = "LP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    // URL resoluble real: VITE_APP_URL > VITE_PAY_URL > window.location.origin (ver @/lib/pay-url).
    const url = buildResolvableUrl(code);
    const monto = selProducts.reduce((a, p) => a + p.price * p.qty, 0);
    const insertLink = {
      cliente_legajo: legajo,
      comercio_id: selectedComercioId,
      comercio_nombre: selectedComercio?.nombre_comercio || "",
      url,
      monto,
      estado: linkStatus,
      referencia: linkRef || null,
      notas: linkNotes || null,
      expira_en: linkExpires ? new Date(linkExpires + "T23:59:59").toISOString() : null,
      pagos_parciales: linkPartial,
      metodos_pago: linkMethods,
    };
    const { data: inserted, error } = await s
      .from("cliente_links_pago")
      .insert(insertLink)
      .select()
      .single();
    if (error || !inserted) {
      toast.error("No se pudo generar el link");
      return;
    }
    const detRows = selProducts.map((p) => ({
      link_id: inserted.id,
      producto_id: p.id,
      producto_nombre: p.name,
      cantidad: p.qty,
      precio_unitario: p.price,
    }));
    const { error: e2 } = await s.from("cliente_links_pago_detalle").insert(detRows);
    if (e2) toast.error("Link creado, pero fallo el detalle");
    const link: PaymentLink = {
      id: inserted.id,
      url,
      products: selProducts,
      status: linkStatus as PaymentLink["status"],
      partialPayments: linkPartial,
      methods: linkMethods,
      reference: linkRef || undefined,
      notes: linkNotes || undefined,
      createdAt: formatDate(new Date()),
      expiresAt: linkExpires || undefined,
      views: 0,
      payments: 0,
      comercioId: selectedComercioId,
      comercioNombre: selectedComercio?.nombre_comercio ?? undefined,
    };
    setLinks((prev) => [link, ...prev]);
    setShowLinkForm(false);
    setTab("links");
    setLinksPage(1);
    setSelected([]);
    setLinkRef("");
    setLinkNotes("");
    setLinkExpires("");
    setLinkPartial(false);
    setLinkMethods([]);
    setLinkStatus("Activo");
    setSelectedComercioId("");
    setComercioBanderas([]);
    toast.success("Link generado con exito");
    await loadLinks(legajo);
  };

  const deleteLink = async (id: string) => {
    const s = requireSupabase();
    const { error } = await s.from("cliente_links_pago").delete().eq("id", id);
    if (error) {
      toast.error("No se pudo eliminar");
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== id));
    toast.success("Link de pago eliminado");
  };

  const saveEditLink = async (
    id: string,
    vals: {
      status: string;
      reference?: string;
      notes?: string;
      expires?: string;
      partial: boolean;
      methods: string[];
    },
  ) => {
    const s = requireSupabase();
    const { error } = await s
      .from("cliente_links_pago")
      .update({
        estado: vals.status,
        referencia: vals.reference || null,
        notas: vals.notes || null,
        expira_en: vals.expires ? new Date(vals.expires + "T23:59:59").toISOString() : null,
        pagos_parciales: vals.partial,
        metodos_pago: vals.methods,
      })
      .eq("id", id);
    if (error) {
      toast.error("No se pudo actualizar el link");
      return;
    }
    toast.success("Link de pago actualizado");
    setEditLink(null);
    if (legajo) await loadLinks(legajo);
  };

  const deleteProduct = async (id: string) => {
    const s = requireSupabase();
    const { error } = await s.from("productos").delete().eq("id", id);
    if (error) {
      toast.error("No se pudo eliminar");
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setSelected((prev) => prev.filter((x) => x !== id));
    toast.success("Producto eliminado");
  };

  const saveProduct = async (product: Product) => {
    const s = requireSupabase();
    const payload = {
      cliente_legajo: legajo,
      nombre: product.name,
      descripcion: product.desc ?? null,
      precio: product.price,
      cantidad: product.qty,
    };
    if (editingProduct) {
      const { error } = await s.from("productos").update(payload).eq("id", editingProduct.id);
      if (error) {
        toast.error("No se pudo actualizar");
        return;
      }
      toast.success("Producto actualizado");
    } else {
      const { error } = await s.from("productos").insert(payload);
      if (error) {
        toast.error("No se pudo crear");
        return;
      }
      toast.success("Producto creado");
    }
    setShowProductForm(false);
    setEditingProduct(null);
    if (legajo) await loadProductos(legajo);
  };

  return (
    <>
      <PageHeader
        title="Productos"
        description="Crea productos y genera links de cobro para compartir con tus clientes."
      />

      <div className="flex gap-6 border-b border-black-100 mb-6">
        {(
          [
            ["productos", "Productos"],
            ["links", "Links de pago"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`w-auto pb-3 text-sm font-semibold transition-colors ${
              tab === k
                ? "border-b-2 border-primary-500 text-black-800"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "productos" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input placeholder="Buscar producto..." className="pl-9" />
            </div>
            <div className="flex gap-2">
              <BtnOutline
                className="h-10"
                onClick={() => {
                  setEditingProduct(null);
                  setShowProductForm(true);
                }}
              >
                <Plus size={15} /> Producto
              </BtnOutline>
              <BtnPrimary
                className="h-10"
                onClick={() => {
                  if (selected.length === 0) {
                    toast.error("Selecciona productos primero");
                    return;
                  }
                  setLinkPartial(false);
                  setLinkMethods(paymentMethods.filter((m) => m.enabled).map((m) => m.id));
                  setLinkExpires("");
                  setLinkStatus("Activo");
                  setLinkRef("");
                  setLinkNotes("");
                  setShowLinkForm(true);
                }}
              >
                <Plus size={15} /> Generar link
              </BtnPrimary>
            </div>
          </div>

          <Card className="p-0 overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        onChange={(e) =>
                          setSelected(e.target.checked ? products.map((p) => p.id) : [])
                        }
                        checked={selected.length === products.length && products.length > 0}
                      />
                    </th>
                    <th className="text-left px-3 py-2.5">Producto</th>
                    <th className="text-right px-3 py-2.5">Cantidad</th>
                    <th className="text-right px-3 py-2.5">Precio</th>
                    <th className="text-left px-3 py-2.5 hidden md:table-cell">Descripcion</th>
                    <th className="text-right px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected.includes(p.id)}
                          onChange={() =>
                            setSelected((prev) =>
                              prev.includes(p.id)
                                ? prev.filter((x) => x !== p.id)
                                : [...prev, p.id],
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-3 font-semibold">{p.name}</td>
                      <td className="px-3 py-3 font-mono tabular-nums text-right">{p.qty}</td>
                      <td className="px-3 py-3 font-mono tabular-nums text-right font-semibold">
                        {formatMoney(p.price, { decimals: 0 })}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground hidden md:table-cell">
                        {p.desc || "-"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <BtnOutline
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              setEditingProduct(p);
                              setShowProductForm(true);
                            }}
                          >
                            Editar
                          </BtnOutline>
                          <BtnOutline
                            className="h-7 px-2 text-[11px]"
                            onClick={() => setConfirmarEliminarId(p.id)}
                          >
                            Eliminar
                          </BtnOutline>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <ProductFormDialog
            key={editingProduct?.id ?? "nuevo"}
            open={showProductForm}
            onClose={() => {
              setShowProductForm(false);
              setEditingProduct(null);
            }}
            product={editingProduct}
            onSave={saveProduct}
          />

          <FormDialog
            open={showLinkForm}
            onClose={() => {
              setShowLinkForm(false);
              setSelectedComercioId("");
              setComercioBanderas([]);
            }}
            title="Generar link de pago"
            description="Configura los metodos de pago y opciones del enlace."
            submitLabel="Generar link"
            size="lg"
            onSubmit={generateLink}
          >
            <div>
              <Label>Comercio</Label>
              <select
                className="w-full h-10 px-3 rounded-md border bg-card text-sm"
                value={selectedComercioId}
                onChange={(e) => setSelectedComercioId(e.target.value)}
              >
                <option value="">Seleccionar comercio...</option>
                {userComercios.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre_comercio || c.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-md bg-muted text-xs">
              <span className="text-muted-foreground">Productos seleccionados: </span>
              <span className="font-semibold">{selected.length}</span>
              {" - "}
              <span className="font-semibold">
                {formatMoney(
                  products
                    .filter((p) => selected.includes(p.id))
                    .reduce((s, p) => s + p.price * p.qty, 0),
                  { decimals: 0 },
                )}
              </span>
            </div>

            <label className="flex items-center justify-between text-sm">
              <span className="font-semibold">Permitir pagos parciales</span>
              <input
                type="checkbox"
                checked={linkPartial}
                onChange={(e) => setLinkPartial(e.target.checked)}
                className="toggle"
              />
            </label>

            {!selectedComercioId ? (
              <div className="p-4 rounded-md bg-muted/50 text-center text-sm text-muted-foreground">
                Selecciona un comercio para ver los metodos de pago disponibles
              </div>
            ) : comercioBanderas.length === 0 ? (
              <div className="p-4 rounded-md bg-muted/50 text-center text-sm text-muted-foreground">
                Este comercio no tiene metodos de pago configurados
              </div>
            ) : (
              <div>
                <Label>Metodos de pago permitidos</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {comercioBanderas.map((b) => {
                    const isSelected = linkMethods.includes(b.methodId);
                    return (
                      <label
                        key={b.id}
                        className={
                          "flex items-center gap-2 px-3 py-2 rounded-md border text-xs cursor-pointer transition " +
                          (isSelected
                            ? "border-primary bg-[color:var(--brand-primary-50)]"
                            : "bg-card hover:bg-muted")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleMethod(b.methodId)}
                          className="accent-[color:var(--brand-primary-700)]"
                        />
                        {b.bandera}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha de expiracion</Label>
                <Input
                  type="date"
                  value={linkExpires}
                  onChange={(e) => setLinkExpires(e.target.value)}
                />
              </div>
              <div>
                <Label>Estado</Label>
                <select
                  className="w-full h-10 px-3 rounded-md border bg-card text-sm"
                  value={linkStatus}
                  onChange={(e) => setLinkStatus(e.target.value)}
                >
                  <option value="Pendiente de aprobación">Pendiente de aprobación</option>
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Referencia interna</Label>
              <Input
                placeholder="FACT-0034"
                value={linkRef}
                onChange={(e) => setLinkRef(e.target.value)}
              />
            </div>
            <div>
              <Label>Observaciones (opcional)</Label>
              <textarea
                className="w-full h-20 px-3 py-2 rounded-md border bg-card text-sm resize-none"
                value={linkNotes}
                onChange={(e) => setLinkNotes(e.target.value)}
              />
            </div>
          </FormDialog>

          <ConfirmDialog
            open={confirmarEliminarId !== null}
            title="¿Eliminar producto?"
            description="Esta accion no se puede deshacer."
            onClose={() => setConfirmarEliminarId(null)}
            onConfirm={() => {
              if (confirmarEliminarId) deleteProduct(confirmarEliminarId);
            }}
          />
        </>
      )}

      {tab === "links" &&
        (() => {
          const totalLinks = links.length;
          const totalLinkPages = Math.max(1, Math.ceil(totalLinks / LINKS_PAGE_SIZE));
          const safeLinksPage = Math.min(linksPage, totalLinkPages);
          const paginatedLinks = links.slice(
            (safeLinksPage - 1) * LINKS_PAGE_SIZE,
            safeLinksPage * LINKS_PAGE_SIZE,
          );

          return (
            <Card className="p-0 overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <h3 className="font-semibold text-sm">Links de pago generados</h3>
                <span className="text-xs text-muted-foreground">
                  {totalLinks} link{totalLinks !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
                      <th className="text-left px-5 py-2.5">ID</th>
                      <th className="text-left px-5 py-2.5">Comercio</th>
                      <th className="text-left px-5 py-2.5">Descripcion</th>
                      <th className="text-left px-5 py-2.5">Estado</th>
                      <th className="text-right px-5 py-2.5">Monto total</th>
                      <th className="text-left px-5 py-2.5">Fecha de expiracion</th>
                      <th className="text-right px-5 py-2.5">Pagos</th>
                      <th className="text-left px-5 py-2.5">Link de pago</th>
                      <th className="text-right px-5 py-2.5">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totalLinks === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-5 py-10 text-center text-sm text-muted-foreground"
                        >
                          Aun no generaste links de pago. Crealos desde la pestana Productos.
                        </td>
                      </tr>
                    ) : (
                      paginatedLinks.map((l) => {
                        const monto = l.products.reduce((s, p) => s + p.price * p.qty, 0);
                        const desc = l.products.map((p) => p.name).join(", ") || l.reference || "-";
                        return (
                          <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-5 py-3 font-mono text-xs">
                              {l.url.split("/").pop() ?? l.id}
                            </td>
                            <td
                              className="px-5 py-3 text-xs max-w-[150px] truncate"
                              title={l.comercioNombre || "-"}
                            >
                              {l.comercioNombre || "-"}
                            </td>
                            <td className="px-5 py-3 text-xs max-w-[220px] truncate" title={desc}>
                              {desc}
                            </td>
                            <td className="px-5 py-3">
                              <Badge
                                tone={
                                  linkDisplayStatus(l) === "Activo"
                                    ? "success"
                                    : linkDisplayStatus(l) === "Inactivo"
                                      ? "neutral"
                                      : "danger"
                                }
                              >
                                {linkDisplayStatus(l)}
                              </Badge>
                            </td>
                            <td className="px-5 py-3 font-mono tabular-nums text-right text-xs font-semibold">
                              {formatMoney(monto, { decimals: 0 })}
                            </td>
                            <td className="px-5 py-3 text-xs text-muted-foreground">
                              {l.expiresAt || "N/A"}
                            </td>
                            <td className="px-5 py-3 font-mono tabular-nums text-right text-xs">
                              {l.payments}
                            </td>
                            <td className="px-5 py-3">
                              <BtnOutline
                                className="h-7 px-2 text-[11px]"
                                onClick={() => {
                                  navigator.clipboard.writeText(l.url);
                                  toast.success("Link copiado");
                                }}
                              >
                                <Copy size={12} /> Copiar
                              </BtnOutline>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => setDetailLink(l)}
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-muted transition"
                                  title="Ver detalle"
                                >
                                  <Eye size={14} />
                                </button>
                                <button
                                  onClick={() => setEditLink(l)}
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-muted transition"
                                  title="Editar"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => setConfirmarEliminarLinkId(l.id)}
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-danger-50 hover:text-danger-600 transition"
                                  title="Eliminar"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {totalLinks > 0 && (
                <div className="px-5 py-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Mostrando {(safeLinksPage - 1) * LINKS_PAGE_SIZE + 1}–
                    {Math.min(safeLinksPage * LINKS_PAGE_SIZE, totalLinks)} de {totalLinks}
                  </span>
                  <div className="flex gap-1">
                    <BtnOutline
                      className="h-7 px-2 text-[11px]"
                      disabled={safeLinksPage <= 1}
                      onClick={() => setLinksPage(1)}
                    >
                      «
                    </BtnOutline>
                    <BtnOutline
                      className="h-7 px-2 text-[11px]"
                      disabled={safeLinksPage <= 1}
                      onClick={() => setLinksPage((p) => Math.max(1, p - 1))}
                    >
                      ‹
                    </BtnOutline>
                    <span className="h-7 px-2 flex items-center font-medium">
                      {safeLinksPage}/{totalLinkPages}
                    </span>
                    <BtnOutline
                      className="h-7 px-2 text-[11px]"
                      disabled={safeLinksPage >= totalLinkPages}
                      onClick={() => setLinksPage((p) => Math.min(totalLinkPages, p + 1))}
                    >
                      ›
                    </BtnOutline>
                    <BtnOutline
                      className="h-7 px-2 text-[11px]"
                      disabled={safeLinksPage >= totalLinkPages}
                      onClick={() => setLinksPage(totalLinkPages)}
                    >
                      »
                    </BtnOutline>
                  </div>
                </div>
              )}
            </Card>
          );
        })()}

      {detailLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setDetailLink(null);
              setDetailLinkBanderas([]);
            }}
          />
          <div className="relative bg-card rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-card border-b px-6 py-4 flex justify-between items-center z-10">
              <div className="font-semibold">Detalle del link de pago</div>
              <button
                onClick={() => {
                  setDetailLink(null);
                  setDetailLinkBanderas([]);
                }}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-accent transition"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="font-mono text-sm break-all p-3 bg-muted rounded">
                {detailLink.url}
              </div>
              <div className="flex gap-2">
                <BtnOutline
                  className="flex-1 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(detailLink.url);
                    toast.success("Link copiado");
                  }}
                >
                  <Copy size={13} /> Copiar enlace
                </BtnOutline>
                <BtnOutline
                  className="flex-1 text-xs"
                  onClick={() => {
                    setEditLink(detailLink);
                    setDetailLink(null);
                  }}
                >
                  <Edit3 size={13} /> Editar
                </BtnOutline>
                <BtnOutline
                  className="flex-1 text-xs"
                  onClick={() => {
                    if (navigator.share) navigator.share({ url: detailLink.url }).catch(() => {});
                    else {
                      navigator.clipboard.writeText(detailLink.url);
                      toast.success("Link copiado");
                    }
                  }}
                >
                  <Share2 size={13} /> Compartir
                </BtnOutline>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">ID</span>
                  <div className="font-mono">
                    {detailLink.url.split("/").pop() ?? detailLink.id}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Estado</span>
                  <div>
                    <Badge
                      tone={
                        linkDisplayStatus(detailLink) === "Activo"
                          ? "success"
                          : linkDisplayStatus(detailLink) === "Inactivo"
                            ? "neutral"
                            : "danger"
                      }
                    >
                      {linkDisplayStatus(detailLink)}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Monto total</span>
                  <div className="font-semibold">
                    {formatMoney(
                      detailLink.products.reduce((s, p) => s + p.price * p.qty, 0),
                      { decimals: 0 },
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Pagos</span>
                  <div>{detailLink.payments}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Creado</span>
                  <div>{detailLink.createdAt}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Expira</span>
                  <div>{detailLink.expiresAt || "N/A"}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Comercio</span>
                  <div className="font-semibold">{detailLink.comercioNombre || "-"}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-muted-foreground">Metodos de pago</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {detailLinkBanderas.length > 0 ? (
                      detailLinkBanderas.map((b, i) => (
                        <Badge key={i} tone="neutral">
                          {b}
                        </Badge>
                      ))
                    ) : detailLink.methods.length > 0 ? (
                      detailLink.methods.map((m, i) => (
                        <Badge key={i} tone="neutral">
                          {m}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-xs">Sin metodos de pago</span>
                    )}
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-muted-foreground">Productos</span>
                  <div className="font-semibold">
                    {detailLink.products.map((p) => p.name).join(", ")}
                  </div>
                </div>
                {detailLink.reference && (
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground">Referencia</span>
                    <div>{detailLink.reference}</div>
                  </div>
                )}
                {detailLink.notes && (
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground">Observaciones</span>
                    <div>{detailLink.notes}</div>
                  </div>
                )}
                <div>
                  <span className="text-xs text-muted-foreground">Pagos parciales</span>
                  <div>{detailLink.partialPayments ? "Si" : "No"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmarEliminarLinkId !== null}
        title="¿Eliminar link de pago?"
        description="El enlace dejara de funcionar y no se podra recuperar. Esta accion no se puede deshacer."
        onClose={() => setConfirmarEliminarLinkId(null)}
        onConfirm={() => {
          if (confirmarEliminarLinkId) deleteLink(confirmarEliminarLinkId);
          setConfirmarEliminarLinkId(null);
        }}
      />

      <LinkEditDialog link={editLink} onClose={() => setEditLink(null)} onSave={saveEditLink} />
    </>
  );
}

function ProductFormDialog({
  open,
  onClose,
  product,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  onSave: (p: Product) => void;
}) {
  const [name, setName] = useState(product?.name || "");
  const [qty, setQty] = useState(product?.qty.toString() || "1");
  const [price, setPrice] = useState(product?.price.toString() || "");
  const [desc, setDesc] = useState(product?.desc || "");

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={product ? "Editar producto" : "Nuevo producto"}
      description="Registra un producto para asociarlo a un link de pago."
      submitLabel={product ? "Guardar cambios" : "Crear producto"}
      onSubmit={() => {
        if (!name || !price) {
          toast.error("Nombre y precio son obligatorios");
          return;
        }
        onSave({
          id: product?.id || "p" + Date.now(),
          name,
          qty: parseInt(qty) || 1,
          price: parseFloat(price.replace(/[^0-9,]/g, "").replace(",", ".")) || 0,
          desc: desc || undefined,
        });
      }}
    >
      <div>
        <Label>Nombre del producto</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Suscripcion Premium"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Cantidad</Label>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <Label>Precio ($)</Label>
          <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="29900" />
        </div>
      </div>
      <div>
        <Label>Descripcion (opcional)</Label>
        <Input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Plan mensual premium"
        />
      </div>
    </FormDialog>
  );
}

function LinkEditDialog({
  link,
  onClose,
  onSave,
}: {
  link: PaymentLink | null;
  onClose: () => void;
  onSave: (
    id: string,
    vals: {
      status: string;
      reference?: string;
      notes?: string;
      expires?: string;
      partial: boolean;
      methods: string[];
    },
  ) => void;
}) {
  const [status, setStatus] = useState("Activo");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [expires, setExpires] = useState("");
  const [partial, setPartial] = useState(false);
  const [methods, setMethods] = useState<string[]>([]);

  useEffect(() => {
    if (link) {
      setStatus(link.status);
      setReference(link.reference ?? "");
      setNotes(link.notes ?? "");
      setExpires(link.expiresAt ? link.expiresAt.split("/").reverse().join("-") : "");
      setPartial(link.partialPayments);
      setMethods(link.methods);
    }
  }, [link]);

  const toggleMethod = (id: string) => {
    setMethods((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <FormDialog
      open={link !== null}
      onClose={onClose}
      title="Editar link de pago"
      description="Modifica la configuracion del enlace de cobro."
      submitLabel="Guardar cambios"
      onSubmit={() => {
        if (!link) return;
        onSave(link.id, { status, reference, notes, expires, partial, methods });
      }}
    >
      <div>
        <Label>Estado</Label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full h-10 px-3 rounded-md border bg-card text-sm"
        >
          <option value="Activo">Activo</option>
          <option value="Inactivo">Inactivo</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Referencia</Label>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Factura 00123"
          />
        </div>
        <div>
          <Label>Fecha de expiracion</Label>
          <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Observaciones</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full h-20 px-3 py-2 rounded-md border bg-card text-sm resize-none"
          placeholder="Notas del cobro"
        />
      </div>
      <label className="flex items-center justify-between text-sm cursor-pointer">
        <span className="font-semibold">Permitir pagos parciales</span>
        <input
          type="checkbox"
          checked={partial}
          onChange={(e) => setPartial(e.target.checked)}
          className="toggle"
        />
      </label>
      <div>
        <Label>Metodos de pago permitidos</Label>
        {(["credit", "debit"] as const).map((cat) => (
          <div key={cat} className="mb-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
              {cat === "credit" ? "Tarjetas de Credito" : "Tarjetas de Debito"}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {paymentMethods
                .filter((m) => m.category === cat)
                .map((m) => (
                  <label
                    key={m.id}
                    className={
                      "flex items-center gap-2 px-3 py-2 rounded-md border text-xs cursor-pointer transition " +
                      (!m.enabled
                        ? "opacity-40 cursor-not-allowed"
                        : methods.includes(m.id)
                          ? "border-primary bg-[color:var(--brand-primary-50)]"
                          : "bg-card hover:bg-muted")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={methods.includes(m.id)}
                      disabled={!m.enabled}
                      onChange={() => m.enabled && toggleMethod(m.id)}
                      className="accent-[color:var(--brand-primary-700)]"
                    />
                    {m.label}
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>
    </FormDialog>
  );
}
