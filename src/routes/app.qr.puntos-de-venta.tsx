import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Search,
  Eye,
  Edit3,
  Trash2,
  Info,
  X,
  Download,
  Printer,
  ScanLine,
} from "lucide-react";
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
import { requireSupabase } from "@/lib/supabase";
import { buildQrPdvUrl } from "@/lib/pay-url";
import QRCode from "qrcode";

export const Route = createFileRoute("/app/qr/puntos-de-venta")({ component: Page });

type EstadoPdv = "Activado" | "Desactivado";

type PuntoVenta = {
  id: string;
  nombre: string;
  estado: EstadoPdv;
  created_at: string;
};

const ROWS_OPTIONS = [10, 20, 50];

function fmtFecha(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("es-AR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function Page() {
  const [pdvs, setPdvs] = useState<PuntoVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [comercioId, setComercioId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("Todos");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [crearOpen, setCrearOpen] = useState(false);
  const [form, setForm] = useState({ nombre: "", estado: "Activado" as EstadoPdv }); // display only; real insert usa Pendiente de aprobación
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detallePd, setDetallePd] = useState<PuntoVenta | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [eliminarOpen, setEliminarOpen] = useState(false);
  const [eliminarId, setEliminarId] = useState<string | null>(null);
  const [scan, setScan] = useState(false);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resolverComercio(
    s: ReturnType<typeof requireSupabase>,
  ): Promise<{ id: string | null; error?: string }> {
    const { data: u } = await s.auth.getUser();
    const mail = u.user?.email;
    if (!mail) return { id: null, error: "No se pudo obtener el correo del usuario" };
    const { data: cli, error: cliErr } = await s
      .from("clientes")
      .select("legajo")
      .eq("correo", mail)
      .maybeSingle();
    if (cliErr) {
      console.error("Error buscando cliente:", cliErr);
      return { id: null, error: "Error al buscar el cliente asociado" };
    }
    if (!cli?.legajo)
      return { id: null, error: "No se encontró un cliente asociado a este usuario" };

    const { data: com, error: comErr } = await s
      .from("comercios")
      .select("id")
      .eq("legajo", cli.legajo)
      .maybeSingle();
    if (comErr) {
      console.error("Error buscando comercio:", comErr);
      return { id: null, error: "Error al buscar el comercio" };
    }
    if (com?.id) return { id: com.id };

    // Si el usuario no tiene un comercio todavia, lo creamos para poder vincular PDVs.
    const { data: nuevo, error } = await s
      .from("comercios")
      .insert({ usuario: mail, legajo: cli.legajo, estado: "Activado", nivel: "Estándar" })
      .select("id")
      .single();
    if (error) {
      console.error("Error creando comercio:", error);
      return {
        id: null,
        error: "No se pudo crear el comercio. Verificá tu cuenta o contactá soporte.",
      };
    }
    return { id: nuevo?.id ?? null };
  }

  async function cargar() {
    setLoading(true);
    try {
      const s = requireSupabase();
      const resultado = await resolverComercio(s);
      setComercioId(resultado.id);
      if (!resultado.id) {
        setPdvs([]);
        if (resultado.error) toast.error(resultado.error);
        return;
      }
      const { data, error } = await s
        .from("puntos_venta")
        .select("id, nombre, estado, created_at")
        .eq("comercio_id", resultado.id)
        .order("created_at", { ascending: true });
      if (error) {
        toast.error("No se pudieron cargar los puntos de venta");
        console.error(error);
        return;
      }
      setPdvs(
        (data ?? []).map((r: any) => ({
          id: r.id,
          nombre: r.nombre,
          estado: r.estado,
          created_at: r.created_at,
        })),
      );
    } catch (e) {
      toast.error("Error al cargar los puntos de venta");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let list = [...pdvs];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.nombre.toLowerCase().includes(q));
    }
    if (estadoFilter !== "Todos") {
      list = list.filter((p) => p.estado === estadoFilter);
    }
    if (fechaInicio) {
      list = list.filter((p) => (p.created_at ?? "").slice(0, 10) >= fechaInicio);
    }
    if (fechaFin) {
      list = list.filter((p) => (p.created_at ?? "").slice(0, 10) <= fechaFin);
    }
    return list;
  }, [pdvs, search, estadoFilter, fechaInicio, fechaFin]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const resetFilters = () => {
    setSearch("");
    setEstadoFilter("Todos");
    setFechaInicio("");
    setFechaFin("");
    setPage(1);
  };

  const openCrear = () => {
    setForm({ nombre: "", estado: "Activado" });
    setEditingId(null);
    setCrearOpen(true);
  };

  const openEditar = (p: PuntoVenta) => {
    setForm({ nombre: p.nombre, estado: p.estado });
    setEditingId(p.id);
    setCrearOpen(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (!comercioId) {
      toast.error("No se encontró un comercio asociado para este usuario");
      return;
    }
    try {
      const s = requireSupabase();
      if (editingId) {
        const { error } = await s
          .from("puntos_venta")
          .update({ nombre: form.nombre.trim(), estado: form.estado })
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Punto de venta actualizado");
      } else {
        const { error } = await s.from("puntos_venta").insert({
          comercio_id: comercioId,
          nombre: form.nombre.trim(),
          estado: "Pendiente de aprobación",
        });
        if (error) throw error;
        toast.success("Punto de venta creado (Pendiente de aprobación — Payway lo activará)");
      }
      setCrearOpen(false);
      setEditingId(null);
      await cargar();
    } catch (e) {
      toast.error("No se pudo guardar el punto de venta");
      console.error(e);
    }
  };

  const confirmarEliminar = (id: string) => {
    setEliminarId(id);
    setEliminarOpen(true);
  };

  const ejecutarEliminar = async () => {
    if (!eliminarId) return;
    try {
      const s = requireSupabase();
      const { error } = await s.from("puntos_venta").delete().eq("id", eliminarId);
      if (error) throw error;
      toast.success("Punto de venta eliminado");
      setPdvs((prev) => prev.filter((p) => p.id !== eliminarId));
    } catch (e) {
      toast.error("No se pudo eliminar el punto de venta");
      console.error(e);
    } finally {
      setEliminarOpen(false);
      setEliminarId(null);
    }
  };

  const verDetalle = async (p: PuntoVenta) => {
    setDetallePd(p);
    setDetalleOpen(true);
    try {
      const url = buildQrPdvUrl(p.id);
      const qr = await QRCode.toDataURL(url, { width: 280, margin: 2 });
      setQrDataUrl(qr);
    } catch {
      setQrDataUrl("");
    }
  };

  return (
    <>
      <PageHeader
        title="Puntos de Venta"
        description="Crea y gestiona los puntos de venta con cobro mediante QR."
      />

      {/* Escaneo de codigos */}
      <Card className="mb-6 flex flex-wrap items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-[color:var(--brand-primary-50)] text-[color:var(--brand-primary-700)] flex items-center justify-center">
          <ScanLine size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">Escaneo de codigos</div>
          <div className="text-xs text-muted-foreground">
            Para realizar pagos en comercios, profesionales, etc. Escanea el codigo de barras o QR
            desde tu camara.
          </div>
        </div>
        <BtnPrimary className="h-9 px-4 text-xs" onClick={() => setScan(true)}>
          <ScanLine size={14} /> Escanear
        </BtnPrimary>
      </Card>

      {/* Top bar */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Cargando…"
              : filtered.length === pdvs.length
                ? `Total: ${pdvs.length} punto${pdvs.length !== 1 ? "s" : ""} de venta`
                : `${filtered.length} de ${pdvs.length} punto${pdvs.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <BtnPrimary onClick={openCrear}>
          <Plus size={15} /> Crear Punto de Venta
        </BtnPrimary>
      </div>

      {/* Banner informativo */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
        <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Información sobre Puntos de Venta</p>
          <p className="text-xs text-blue-700 mt-1 leading-relaxed">
            Los puntos de venta permiten identificar y gestionar los cobros realizados dentro de una
            misma entidad.
          </p>
          <p className="text-xs text-blue-700 mt-1 leading-relaxed">
            Si necesita separar la operación por una unidad de negocio distinta, se recomienda crear
            una subcuenta y habilitar el cobro con QR en dicha subcuenta.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label>Nombre</Label>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="pl-8"
                placeholder="Buscar por nombre..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <div>
            <Label>Estado</Label>
            <select
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
              value={estadoFilter}
              onChange={(e) => {
                setEstadoFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="Todos">Todos</option>
              <option value="Activado">Activado</option>
              <option value="Desactivado">Desactivado</option>
            </select>
          </div>
          <div>
            <Label>Fecha inicio</Label>
            <Input
              type="date"
              value={fechaInicio}
              onChange={(e) => {
                setFechaInicio(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <Label>Fecha fin</Label>
            <Input
              type="date"
              value={fechaFin}
              onChange={(e) => {
                setFechaFin(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        {(search || estadoFilter !== "Todos" || fechaInicio || fechaFin) && (
          <button
            onClick={resetFilters}
            className="mt-3 text-xs text-primary-ink font-semibold hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </Card>

      {/* Tabla */}
      <Card className="p-0 overflow-hidden">
        <div className="hidden lg:grid grid-cols-[1.4fr_0.8fr_1fr_1.1fr] gap-4 px-5 py-3 border-b text-xs uppercase tracking-wide text-muted-foreground bg-muted/30">
          <div>Nombre</div>
          <div>Estado</div>
          <div>Fecha de creación</div>
          <div className="text-right">Acciones</div>
        </div>
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            Cargando puntos de venta…
          </div>
        ) : paginated.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            No hay registros
          </div>
        ) : (
          paginated.map((p) => (
            <div
              key={p.id}
              className="lg:grid lg:grid-cols-[1.4fr_0.8fr_1fr_1.1fr] gap-4 px-5 py-3.5 border-b last:border-0 items-center"
            >
              <div className="font-semibold text-sm">{p.nombre}</div>
              <div>
                <Badge tone={p.estado === "Activado" ? "success" : "warn"}>{p.estado}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">{fmtFecha(p.created_at)}</div>
              <div className="flex gap-1 justify-end">
                <BtnOutline className="h-8 px-2.5 text-xs" onClick={() => verDetalle(p)}>
                  <Eye size={13} /> Ver
                </BtnOutline>
                <BtnOutline className="h-8 px-2.5 text-xs" onClick={() => openEditar(p)}>
                  <Edit3 size={13} /> Editar
                </BtnOutline>
                <BtnOutline
                  className="h-8 px-2.5 text-xs hover:border-danger-400 hover:text-danger-600"
                  onClick={() => confirmarEliminar(p.id)}
                >
                  <Trash2 size={13} /> Eliminar
                </BtnOutline>
              </div>
            </div>
          ))
        )}
      </Card>

      {/* Paginación */}
      {!loading && paginated.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Filas por página:</span>
            <select
              className="h-8 px-2 rounded border bg-card text-xs"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {ROWS_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>
              {filtered.length === 0
                ? "0 registros"
                : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length}`}
            </span>
          </div>
          <div className="flex gap-1">
            <BtnOutline
              className="h-8 px-3 text-xs"
              disabled={page <= 1}
              onClick={() => setPage(1)}
            >
              Primero
            </BtnOutline>
            <BtnOutline
              className="h-8 px-3 text-xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </BtnOutline>
            <span className="flex items-center px-3 text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <BtnOutline
              className="h-8 px-3 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Siguiente
            </BtnOutline>
            <BtnOutline
              className="h-8 px-3 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              ultimo
            </BtnOutline>
          </div>
        </div>
      )}

      {/* Modal: Crear / Editar */}
      <FormDialog
        open={crearOpen}
        onClose={() => setCrearOpen(false)}
        title={editingId ? "Editar Punto de Venta" : "Crear Punto de Venta"}
        description="Complete la información para habilitar el cobro mediante QR."
        submitLabel={editingId ? "Guardar cambios" : "Crear Punto de Venta"}
        size="lg"
        onSubmit={guardar}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label>Nombre del punto de venta</Label>
            <Input
              placeholder="Ej. Caja principal"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            />
          </div>
          <div>
            <Label>Estado</Label>
            <select
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
              value={form.estado}
              onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as EstadoPdv }))}
            >
              <option value="Activado">Activado</option>
              <option value="Desactivado">Desactivado</option>
            </select>
          </div>
        </div>
      </FormDialog>

      {/* Modal: Ver detalle */}
      {detalleOpen && detallePd && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetalleOpen(false)} />
          <div className="relative bg-card rounded-lg max-w-lg w-full p-6 shadow-xl">
            <button
              onClick={() => setDetalleOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
            <h3 className="font-semibold text-lg mb-4">{detallePd.nombre}</h3>

            <div className="grid grid-cols-[1fr_auto] gap-6">
              {/* Info */}
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estado</span>
                  <Badge tone={detallePd.estado === "Activado" ? "success" : "warn"}>
                    {detallePd.estado}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fecha de creación</span>
                  <span className="font-semibold">{fmtFecha(detallePd.created_at)}</span>
                </div>
              </div>

              {/* QR */}
              <div className="flex flex-col items-center gap-2">
                <div className="border-2 rounded-xl p-2 bg-white">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="QR" className="w-32 h-32" />
                  ) : (
                    <div className="w-32 h-32 bg-muted animate-pulse rounded" />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">
                  Escaneá para pagar en
                  <br />
                  {detallePd.nombre}
                </span>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <BtnOutline className="flex-1 h-9 text-xs" onClick={() => setDetalleOpen(false)}>
                Cerrar
              </BtnOutline>
              <BtnOutline
                className="h-9 text-xs"
                onClick={() => {
                  if (qrDataUrl) {
                    const a = document.createElement("a");
                    a.href = qrDataUrl;
                    a.download = `qr-${detallePd.id}.png`;
                    a.click();
                  }
                }}
              >
                <Download size={13} /> QR
              </BtnOutline>
              <BtnOutline
                className="h-9 text-xs"
                onClick={() => {
                  if (qrDataUrl) {
                    const w = window.open();
                    if (w) {
                      w.document.write(`<img src="${qrDataUrl}" onload="window.print()" />`);
                    }
                  }
                }}
              >
                <Printer size={13} />
              </BtnOutline>
              <BtnPrimary
                className="flex-1 h-9 text-xs"
                onClick={() => {
                  setDetalleOpen(false);
                  openEditar(detallePd);
                }}
              >
                <Edit3 size={13} /> Editar
              </BtnPrimary>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Escaneo de codigos */}
      {scan && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setScan(false)} />
          <div className="relative bg-card rounded-xl max-w-md w-full shadow-2xl">
            <div className="sticky top-0 bg-card border-b px-6 py-4 flex justify-between items-center rounded-t-xl">
              <div className="font-semibold">Escanear codigo</div>
              <button
                onClick={() => setScan(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-accent transition"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-center w-full h-48 rounded-lg bg-muted/40 border border-dashed">
                <ScanLine size={48} className="text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Apunta la camara al codigo de barras o QR del comercio para iniciar el pago.
              </p>
              <BtnPrimary
                className="w-full"
                onClick={() => {
                  if (navigator.mediaDevices?.getUserMedia) {
                    navigator.mediaDevices
                      .getUserMedia({ video: true })
                      .then((stream) => {
                        stream.getTracks().forEach((t) => t.stop());
                        toast.success("Camara lista para escanear");
                        setScan(false);
                      })
                      .catch(() => toast.error("No se pudo acceder a la camara"));
                  } else {
                    toast.error("Este dispositivo no soporta camara");
                  }
                }}
              >
                <ScanLine size={15} /> Abrir camara
              </BtnPrimary>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar eliminación */}
      {eliminarOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEliminarOpen(false)} />
          <div className="relative bg-card rounded-lg max-w-sm w-full p-6 shadow-xl text-center">
            <Trash2 size={28} className="mx-auto text-danger-500 mb-3" />
            <h3 className="font-semibold text-base mb-2">¿Eliminar punto de venta?</h3>
            <p className="text-sm text-muted-foreground mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3 justify-center">
              <BtnOutline onClick={() => setEliminarOpen(false)}>Cancelar</BtnOutline>
              <BtnPrimary className="bg-danger-600 hover:bg-danger-700" onClick={ejecutarEliminar}>
                Eliminar
              </BtnPrimary>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
