import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { resolveColor } from "@/brand/colors";
import { brand } from "@/brand/brand";
import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import {
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  Pencil,
  Trash2,
  Search,
  ArrowLeftRight,
  Lock,
  Download,
  Filter,
  X,
  Pause,
  Play,
  Building2,
  ChevronUp,
  PieChart,
  Copy,
  MoreHorizontal,
  History,
  SlidersHorizontal,
} from "lucide-react";
import {
  PageHeader,
  Card,
  BtnPrimary,
  BtnOutline,
  Badge,
  Input,
  Label,
} from "@/components/portal-shell";
import { toast } from "sonner";
import { FormDialog } from "@/components/form-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { requireSupabase, toDataError, isPermissionError } from "@/lib/supabase";
import { SALDOS_EMBED, conSaldos } from "@/lib/subaccounts";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

export const Route = createFileRoute("/app/subcuentas")({ component: Page });

type Sub = {
  id?: string;
  n: string;
  apellido: string;
  email: string;
  cbu: string;
  tipo: "Operativa" | "Recaudacion" | "Garantias" | "Sueldos";
  e: "Activa" | "Pausada";
  disp: number;
  ret: number;
  conc: number;
  ing: string;
  egr: string;
  resp: string;
  lim: string;
  color: string;
  retirosHab: boolean;
};

type Mov = {
  tipo: "ingreso" | "egreso";
  titulo: string;
  txid: string;
  cbu: string;
  entidad: string;
  fecha: string;
  hora: string;
  monto: number;
};

const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

const mapSubs = (rows: any[]): Sub[] =>
  rows.map((r, i) => ({
    id: r.id,
    n: r.nombre,
    apellido: r.apellido ?? "",
    email: r.email ?? "",
    cbu: r.cbu ?? "",
    tipo: r.tipo,
    e: r.estado,
    disp: Number(r.saldo_disponible ?? 0),
    ret: Number(r.saldo_retenido ?? 0),
    conc: Number(r.saldo_conciliado ?? 0),
    ing: r.ingresos ?? "",
    egr: r.egresos ?? "",
    resp: r.responsable ?? "",
    lim: r.limite ?? "",
    color: PALETTE[i % PALETTE.length],
    retirosHab: !!r.retiros_habilitados,
  }));

const fmt = (n: number) => "$ " + n.toLocaleString("es-AR");
const fmtMov = (n: number) => (n >= 0 ? "+" : "") + "$ " + Math.abs(n).toLocaleString("es-AR");

// `limite` es texto libre: puede venir "50000", "50.000,00" o vacio.
const fmtLimite = (lim: string) => {
  const t = (lim ?? "").trim();
  if (!t) return "Sin límite";
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  if (Number.isNaN(n)) return t;
  return n > 0 ? fmt(n) : "Sin límite";
};

// Recaudacion es la subcuenta funcional (pool) del sistema; el resto se asigna
// a personas o areas.
const esPool = (s: Sub) => s.tipo === "Recaudacion";
const TIPO_LABEL: Record<Sub["tipo"], string> = {
  Operativa: "Operativa",
  Recaudacion: "Recaudación",
  Garantias: "Garantías",
  Sueldos: "Sueldos",
};

const copiarCvu = async (cvu: string) => {
  if (!cvu) {
    toast.error("La subcuenta no tiene CVU asignado");
    return;
  }
  try {
    await navigator.clipboard.writeText(cvu);
    toast.success("CVU copiado");
  } catch {
    toast.error("No se pudo copiar el CVU");
  }
};

const TITULO_MOV: Record<string, string> = {
  deposito: "Depósito",
  transferencia: "Transferencia",
  cobro_pct: "Cobro QR / Punto de venta",
  retiro: "Retiro",
  pago_pct: "Pago QR",
  tarjeta: "Cobro con tarjeta",
  liquidacion_lote: "Liquidación de lote",
  acreditacion_lote: "Acreditación de lote",
  adelanto: "Adelanto",
  ajuste_manual: "Ajuste de saldo",
};

function Page() {
  const navigate = useNavigate();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clienteLegajo, setClienteLegajo] = useState<string | null>(null);

  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [transfOpen, setTransfOpen] = useState(false);
  const [detailSub, setDetailSub] = useState<Sub | null>(null);
  const [editSub, setEditSub] = useState<Sub | null>(null);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [estado, setEstado] = useState("Todos");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [confirmarBorrar, setConfirmarBorrar] = useState<Sub | null>(null);

  const [form, setForm] = useState({
    n: "",
    apellido: "",
    email: "",
    tipo: "Operativa",
    resp: "",
    lim: "",
    saldo: "",
    activar: true,
  });

  const [transfDesde, setTransfDesde] = useState("");
  const [transfHacia, setTransfHacia] = useState("");
  const [transfMonto, setTransfMonto] = useState("");
  const [transfConcepto, setTransfConcepto] = useState("");
  const [transfLoading, setTransfLoading] = useState(false);

  const cargar = async () => {
    const s = requireSupabase();
    const { data: u } = await s.auth.getUser();
    const mail = u.user?.email;
    if (!mail) return null;
    const { data: cli } = await s
      .from("clientes")
      .select("legajo")
      .eq("correo", mail)
      .maybeSingle();
    setClienteLegajo(cli?.legajo ?? null);
    const { data: rows } = await s
      .from("subaccounts")
      .select(`*, ${SALDOS_EMBED}`)
      .eq("cliente_legajo", cli?.legajo ?? "");
    setSubs(mapSubs((rows ?? []).map(conSaldos)));
    return cli;
  };

  useEffect(() => {
    (async () => {
      try {
        await cargar();
      } catch {
        /* silencioso */
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtradas = useMemo(
    () =>
      subs.filter(
        (s) =>
          (q === "" || s.n.toLowerCase().includes(q.toLowerCase()) || s.cbu.includes(q.trim())) &&
          (tipo === "Todos" || s.tipo === tipo) &&
          (estado === "Todos" || s.e === estado),
      ),
    [subs, q, tipo, estado],
  );

  const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize));
  const paginated = filtradas.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, tipo, estado]);

  const total = subs.reduce((a, s) => a + s.disp + s.ret, 0);
  const totalDisp = subs.reduce((a, s) => a + s.disp, 0);
  const totalRet = subs.reduce((a, s) => a + s.ret, 0);

  const abrirNuevo = () => {
    setEditSub(null);
    setForm({
      n: "",
      apellido: "",
      email: "",
      tipo: "Operativa",
      resp: "",
      lim: "",
      saldo: "",
      activar: true,
    });
    setNuevoOpen(true);
  };
  const abrirEditar = (s: Sub) => {
    setEditSub(s);
    setForm({
      n: s.n,
      apellido: s.apellido,
      email: s.email,
      tipo: s.tipo,
      resp: s.resp,
      lim: s.lim,
      saldo: String(s.disp),
      activar: s.e === "Activa",
    });
    setNuevoOpen(true);
  };

  // Fondeo rapido: abre la transferencia interna con esta subcuenta como
  // destino y la Recaudacion (pool) como origen si existe. Si la subcuenta es
  // la Recaudacion, se invierte: sale desde el pool.
  const abrirFondeo = (s: Sub) => {
    const pool = subs.find((x) => esPool(x) && x.id !== s.id);
    if (esPool(s)) {
      setTransfDesde(s.id ?? "");
      setTransfHacia("");
    } else {
      setTransfDesde(pool?.id ?? "");
      setTransfHacia(s.id ?? "");
    }
    setTransfMonto("");
    setTransfConcepto("");
    setDetailSub(null);
    setTransfOpen(true);
  };

  const verHistorial = (s: Sub) => {
    navigate({ to: "/app/historial", search: { subcuenta: s.n } });
  };

  const onSubmitSub = async () => {
    const s = requireSupabase();
    if (!clienteLegajo) {
      toast.error("No se pudo identificar la cuenta");
      return;
    }
    try {
      if (editSub && editSub.id) {
        const { error } = await s
          .from("subaccounts")
          .update({
            nombre: form.n,
            apellido: form.apellido,
            email: form.email,
            tipo: form.tipo,
            responsable: form.resp,
            limite: form.lim || null,
          })
          .eq("id", editSub.id);
        if (error) throw error;
        toast.success("Subcuenta actualizada");
      } else {
        // CVU de 22 dígitos: 8 de entidad + 14 de cuenta (como los reales).
        // Antes daba 19 dígitos y el banco lo rechazaba como origen.
        const cbu = "00000031" + Math.floor(10000000000000 + Math.random() * 89999999999999);
        // El saldo nace en 0 (trigger en subaccounts); el cliente no puede fijarlo.
        const { error } = await s.from("subaccounts").insert({
          cliente_legajo: clienteLegajo,
          nombre: form.n,
          apellido: form.apellido,
          email: form.email,
          tipo: form.tipo,
          responsable: form.resp,
          limite: form.lim || null,
          cbu,
          estado: form.activar ? "Activa" : "Pausada",
          ingresos: "",
          egresos: "",
          retiros_habilitados: true,
        });
        if (error) throw error;
        toast.success("Subcuenta creada correctamente");
      }
      setNuevoOpen(false);
      setEditSub(null);
      await cargar();
    } catch {
      toast.error("No se pudo guardar la subcuenta");
    }
  };

  const onBorrar = async () => {
    if (!confirmarBorrar?.id) return;
    const s = requireSupabase();
    try {
      await s.from("subaccounts").delete().eq("id", confirmarBorrar.id);
      setSubs((prev) => prev.filter((x) => x.id !== confirmarBorrar.id));
      toast.success("Subcuenta eliminada");
    } catch {
      toast.error("No se pudo eliminar la subcuenta");
    } finally {
      setConfirmarBorrar(null);
    }
  };

  const cambiarEstado = async (id: string, estado: "Activa" | "Pausada") => {
    const s = requireSupabase();
    try {
      await s.from("subaccounts").update({ estado }).eq("id", id);
      setSubs((prev) => prev.map((x) => (x.id === id ? { ...x, e: estado } : x)));
      if (detailSub?.id === id) setDetailSub((d) => (d ? { ...d, e: estado } : d));
      toast.success(estado === "Activa" ? "Subcuenta reactivada" : "Subcuenta pausada");
    } catch {
      toast.error("No se pudo actualizar el estado");
    }
  };

  const onSubmitTransferir = async () => {
    if (transfLoading) return;
    const origen = subs.find((x) => x.id === transfDesde);
    const destino = subs.find((x) => x.id === transfHacia);
    const monto = Number(transfMonto || 0);
    if (!origen?.id || !destino?.id) {
      toast.error("Selecciona las subcuentas de origen y destino");
      return;
    }
    if (transfDesde === transfHacia) {
      toast.error("Las subcuentas deben ser distintas");
      return;
    }
    if (!monto || monto <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }
    if (origen.disp < monto) {
      toast.error("Saldo insuficiente en la subcuenta de origen");
      return;
    }
    setTransfLoading(true);
    try {
      const s = requireSupabase();
      const { data, error } = await s.rpc("registrar_transferencia_subcuentas", {
        p_subcuenta_origen: origen.id,
        p_subcuenta_destino: destino.id,
        p_monto: monto,
        p_concepto: transfConcepto || undefined,
      });
      if (error) throw error;
      setTransfOpen(false);
      setTransfMonto("");
      setTransfConcepto("");
      toast.success(`Transferencia interna por ${fmt(monto)} realizada`);
      await cargar();
    } catch (e) {
      const err = toDataError(e);
      console.error("registrar_transferencia_subcuentas:", err);
      if (isPermissionError(e)) {
        toast.error("Sin permisos para transferir entre estas subcuentas");
      } else {
        toast.error(err.message || "No se pudo realizar la transferencia");
      }
    } finally {
      setTransfLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Subcuentas"
        description="Una cuenta madre, múltiples CVU. Gestiona fondos, responsables y límites."
        action={
          <div className="flex gap-2">
            <BtnOutline onClick={() => setTransfOpen(true)}>
              <ArrowLeftRight size={14} /> Transferir entre subcuentas
            </BtnOutline>
            <BtnPrimary onClick={abrirNuevo}>
              <Plus size={16} /> Nueva subcuenta
            </BtnPrimary>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-card border rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Saldo total
          </div>
          <div className="font-display tabular-nums text-base md:text-lg font-semibold mt-0.5">
            {fmt(total)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{subs.length} subcuentas</div>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Disponible
          </div>
          <div className="font-display tabular-nums text-base md:text-lg font-semibold mt-0.5">
            {fmt(totalDisp)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Listo para operar</div>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Retenido</div>
          <div className="font-display tabular-nums text-base md:text-lg font-semibold mt-0.5">
            {fmt(totalRet)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Pendiente de liberar</div>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <PieChart size={11} /> Distribucion del saldo
          </div>
          <div className="text-[10px] mt-1.5 space-y-1.5">
            {subs.slice(0, 3).map((s) => {
              const pct = total > 0 ? (((s.disp + s.ret) / total) * 100).toFixed(1) : "0.0";
              return (
                <div key={s.id ?? s.n}>
                  <div className="flex justify-between text-[10px] leading-tight">
                    <span className="truncate mr-1">{s.n}</span>
                    <span className="font-semibold shrink-0">
                      {fmt(s.disp + s.ret)} ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-0.5">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: s.color }}
                    />
                  </div>
                </div>
              );
            })}
            {subs.length > 3 && (
              <div className="text-[10px] text-muted-foreground pt-0.5">+{subs.length - 3} mas</div>
            )}
            {subs.length === 0 && (
              <div className="text-[10px] text-muted-foreground pt-0.5">Sin subcuentas</div>
            )}
          </div>
        </div>
      </div>

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o CVU..."
              className="pl-9"
            />
          </div>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="h-10 px-3 rounded-md border bg-card text-sm"
          >
            <option>Todos</option>
            <option>Operativa</option>
            <option>Recaudacion</option>
            <option>Garantias</option>
            <option>Sueldos</option>
          </select>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="h-10 px-3 rounded-md border bg-card text-sm"
          >
            <option>Todos</option>
            <option>Activa</option>
            <option>Pausada</option>
          </select>
        </div>
      </Card>

      {loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Cargando subcuentas…</Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5">Tipo</th>
                  <th className="text-left px-4 py-2.5">Nombre / Identificador</th>
                  <th className="text-left px-4 py-2.5">CVU</th>
                  <th className="text-right px-4 py-2.5">Saldo</th>
                  <th className="text-right px-4 py-2.5">Límite diario</th>
                  <th className="text-left px-4 py-2.5">Estado</th>
                  <th className="text-right px-4 py-2.5">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((s) => {
                  const titular = [s.n, s.apellido].filter(Boolean).join(" ");
                  return (
                    <tr key={s.id ?? s.n} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-0.5">
                          <Badge tone={esPool(s) ? "warn" : "neutral"}>
                            {esPool(s) ? "Pool" : "Individual"}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {TIPO_LABEL[s.tipo] ?? s.tipo}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 min-w-[160px]">
                        <div className="font-semibold">{titular || "Sin nombre"}</div>
                        {s.email && (
                          <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                            {s.email}
                          </div>
                        )}
                        {!s.email && esPool(s) && (
                          <div className="text-xs text-muted-foreground">Subcuenta del sistema</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {s.cbu ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs" title={s.cbu}>
                              {s.cbu}
                            </span>
                            <button
                              onClick={() => copiarCvu(s.cbu)}
                              className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                              title="Copiar CVU"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin CVU</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="font-display tabular-nums font-semibold">{fmt(s.disp)}</div>
                        {s.ret > 0 && (
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            Retenido {fmt(s.ret)}
                          </div>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right whitespace-nowrap tabular-nums ${s.lim ? "" : "text-muted-foreground"}`}
                      >
                        {fmtLimite(s.lim)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={s.e === "Activa" ? "success" : "warn"}>{s.e}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <RowMenu
                          open={menuId === s.id}
                          onToggle={() =>
                            setMenuId((cur) => (cur === s.id ? null : (s.id ?? null)))
                          }
                          onClose={() => setMenuId(null)}
                          items={[
                            {
                              icon: <Eye size={14} />,
                              label: "Ver detalle",
                              onClick: () => setDetailSub(s),
                            },
                            {
                              icon: <ArrowLeftRight size={14} />,
                              label: esPool(s)
                                ? "Transferir desde el pool"
                                : "Fondear / transferir",
                              onClick: () => abrirFondeo(s),
                            },
                            {
                              icon: <Copy size={14} />,
                              label: "Copiar CVU",
                              onClick: () => copiarCvu(s.cbu),
                            },
                            {
                              icon: <History size={14} />,
                              label: "Ver historial",
                              onClick: () => verHistorial(s),
                            },
                            {
                              icon: <SlidersHorizontal size={14} />,
                              label: "Configurar límites y responsable",
                              onClick: () => abrirEditar(s),
                            },
                            {
                              icon: <Pencil size={14} />,
                              label: "Editar datos",
                              onClick: () => abrirEditar(s),
                            },
                            {
                              icon: s.e === "Activa" ? <Pause size={14} /> : <Play size={14} />,
                              label: s.e === "Activa" ? "Pausar subcuenta" : "Reactivar subcuenta",
                              onClick: () =>
                                cambiarEstado(s.id!, s.e === "Activa" ? "Pausada" : "Activa"),
                            },
                            {
                              icon: <Trash2 size={14} />,
                              label: "Eliminar",
                              danger: true,
                              onClick: () => setConfirmarBorrar(s),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No hay subcuentas para mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground">
            <span>
              {filtradas.length === 0
                ? "0 registros"
                : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtradas.length)} de ${filtradas.length}`}
            </span>
            <div className="flex gap-1">
              <BtnOutline
                className="h-7 px-2 text-[11px]"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </BtnOutline>
              <BtnOutline
                className="h-7 px-2 text-[11px]"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente
              </BtnOutline>
            </div>
          </div>
        </Card>
      )}

      {detailSub && (
        <SubDetailModal
          sub={detailSub}
          onClose={() => setDetailSub(null)}
          onCambiarEstado={cambiarEstado}
          onFondear={() => abrirFondeo(detailSub)}
          onVerHistorial={() => verHistorial(detailSub)}
        />
      )}

      <FormDialog
        open={nuevoOpen}
        onClose={() => {
          setNuevoOpen(false);
          setEditSub(null);
        }}
        title={editSub ? "Editar subcuenta" : "Nueva subcuenta"}
        description={
          editSub
            ? "Modifica los datos, el responsable y el límite diario de la subcuenta."
            : "Genera un CVU adicional asociado a tu cuenta madre."
        }
        submitLabel={editSub ? "Guardar cambios" : "Crear subcuenta"}
        onSubmit={onSubmitSub}
      >
        <div>
          <Label>Nombre de la subcuenta</Label>
          <Input
            value={form.n}
            onChange={(e) => setForm((p) => ({ ...p, n: e.target.value }))}
            placeholder="Ej. Sucursal Sur"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Apellido</Label>
            <Input
              value={form.apellido}
              onChange={(e) => setForm((p) => ({ ...p, apellido: e.target.value }))}
              placeholder="Apellido del titular"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="titular@empresa.com"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Tipo</Label>
            <select
              value={form.tipo}
              onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value as Sub["tipo"] }))}
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
            >
              <option>Operativa</option>
              <option>Recaudacion</option>
              <option>Garantias</option>
              <option>Sueldos</option>
            </select>
          </div>
          <div>
            <Label>Responsable</Label>
            <Input
              value={form.resp}
              onChange={(e) => setForm((p) => ({ ...p, resp: e.target.value }))}
              placeholder="Usuario o area"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Límite diario de egreso (ARS)</Label>
            <Input
              value={form.lim}
              onChange={(e) => setForm((p) => ({ ...p, lim: e.target.value }))}
              placeholder="Vacío = sin límite"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={form.activar}
            onChange={(e) => setForm((p) => ({ ...p, activar: e.target.checked }))}
          />{" "}
          Activar inmediatamente al crear
        </label>
      </FormDialog>

      <FormDialog
        open={transfOpen}
        onClose={() => setTransfOpen(false)}
        title="Transferir entre subcuentas"
        description="Movimiento interno · acreditacion inmediata, sin comision."
        submitLabel="Transferir"
        onSubmit={onSubmitTransferir}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Desde</Label>
            <select
              value={transfDesde}
              onChange={(e) => setTransfDesde(e.target.value)}
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
            >
              <option value="">Selecciona...</option>
              {subs.map((s) => (
                <option key={s.id ?? s.n} value={s.id}>
                  {s.n} — {fmt(s.disp)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Hacia</Label>
            <select
              value={transfHacia}
              onChange={(e) => setTransfHacia(e.target.value)}
              className="w-full h-10 px-3 rounded-md border bg-card text-sm"
            >
              <option value="">Selecciona...</option>
              {subs.map((s) => (
                <option key={s.id ?? s.n} value={s.id}>
                  {s.n} — {fmt(s.disp)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label>Monto (ARS)</Label>
          <Input
            value={transfMonto}
            onChange={(e) => setTransfMonto(e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div>
          <Label>Concepto</Label>
          <Input
            value={transfConcepto}
            onChange={(e) => setTransfConcepto(e.target.value)}
            placeholder="Barrido fin de dia, fondeo, etc."
          />
        </div>
      </FormDialog>

      <ConfirmDialog
        open={confirmarBorrar !== null}
        title="¿Eliminar subcuenta?"
        description={`Se quitara la subcuenta ${confirmarBorrar?.n} (CVU ${confirmarBorrar?.cbu || "sin asignar"}). Esta accion no se puede deshacer.`}
        onClose={() => setConfirmarBorrar(null)}
        onConfirm={onBorrar}
      />
    </>
  );
}

type RowMenuItem = { icon: ReactNode; label: string; onClick: () => void; danger?: boolean };

function RowMenu({
  open,
  onToggle,
  onClose,
  items,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  items: RowMenuItem[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        onClick={onToggle}
        className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-muted transition"
        title="Acciones"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-60 rounded-md border bg-card shadow-lg py-1"
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={() => {
                onClose();
                it.onClick();
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${
                it.danger ? "text-danger-600 hover:bg-danger-50" : "hover:bg-muted"
              }`}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SubDetailModal({
  sub,
  onClose,
  onCambiarEstado,
  onFondear,
  onVerHistorial,
}: {
  sub: Sub;
  onClose: () => void;
  onCambiarEstado: (id: string, estado: "Activa" | "Pausada") => void;
  onFondear: () => void;
  onVerHistorial: () => void;
}) {
  const [editEmail, setEditEmail] = useState(false);
  const [emailVal, setEmailVal] = useState(sub.email);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTipo, setFilterTipo] = useState<"todos" | "ingreso" | "egreso">("todos");
  const [filterSearch, setFilterSearch] = useState("");
  const [moves, setMoves] = useState<Mov[]>([]);
  const [loadingMoves, setLoadingMoves] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const s = requireSupabase();
        // `subcuenta_id` identifica la subcuenta propia que intervino; `cvu` es
        // la contraparte. Se usan ambos para no perder movimientos viejos
        // (anteriores a subcuenta_id) ni las transferencias internas.
        const filtro = sub.cbu
          ? `subcuenta_id.eq.${sub.id},cvu.eq.${sub.cbu}`
          : `subcuenta_id.eq.${sub.id}`;
        const { data } = await s
          .from("transactions")
          .select("tipo, monto_operacion, comision, cvu, id_txn, fecha")
          .or(filtro)
          .order("fecha", { ascending: false })
          .limit(200);
        setMoves(
          (data ?? []).map((m: any) => {
            const egreso =
              m.tipo === "transferencia" || m.tipo === "retiro" || m.tipo === "pago_pct";
            return {
              tipo: egreso ? "egreso" : "ingreso",
              titulo: TITULO_MOV[m.tipo] ?? m.tipo,
              txid: m.id_txn,
              cbu: m.cvu,
              entidad: brand.name,
              fecha: (m.fecha ?? "").slice(0, 10),
              hora: (m.fecha ?? "").slice(11, 16),
              monto: Math.abs(Number(m.monto_operacion ?? 0)),
            } as Mov;
          }),
        );
      } catch {
        setMoves([]);
      } finally {
        setLoadingMoves(false);
      }
    })();
  }, [sub.id, sub.cbu]);

  const allMoves = moves;
  const filtMoves = allMoves.filter((m) => {
    if (filterTipo !== "todos" && m.tipo !== filterTipo) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (
        !m.txid.toLowerCase().includes(q) &&
        !m.entidad.toLowerCase().includes(q) &&
        !m.cbu.includes(q)
      )
        return false;
    }
    return true;
  });

  const totalDepositos = allMoves
    .filter((m) => m.tipo === "ingreso")
    .reduce((a, m) => a + m.monto, 0);
  const totalRetiros = allMoves.filter((m) => m.tipo === "egreso").reduce((a, m) => a + m.monto, 0);

  const confirmAction = (accion: string, detalle: string): boolean =>
    window.confirm(`¿Estas seguro de que queres ${accion}?\n\n${detalle}`);

  const downloadReporte = (formato: "excel" | "pdf") => {
    const nombre = (sub.n || sub.cbu || "subcuenta").replace(/\s+/g, "_");
    if (formato === "excel") {
      const ws = XLSX.utils.json_to_sheet([
        { Subcuenta: sub.n, CVU: sub.cbu, Estado: sub.e, Tipo: sub.tipo, Email: sub.email },
        {},
        ...allMoves.map((m) => ({
          Fecha: m.fecha,
          Hora: m.hora,
          Tipo: m.tipo === "ingreso" ? "Ingreso" : "Egreso",
          Concepto: m.titulo,
          TXID: m.txid,
          "CVU contraparte": m.cbu,
          Monto: m.monto,
        })),
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
      XLSX.writeFile(wb, `subcuenta-${nombre}.xlsx`);
      toast.success("Reporte Excel descargado");
    } else {
      const doc = new jsPDF();
      doc.setFillColor(...resolveColor("primary"));
      doc.rect(0, 0, 210, 22, "F");
      doc.setTextColor(...resolveColor("on-primary"));
      doc.setFontSize(14);
      doc.text(brand.name, 14, 15);
      doc.setTextColor(20, 20, 20);
      doc.setFontSize(10);
      doc.text(`Subcuenta: ${sub.n || sub.cbu}`, 14, 32);
      doc.text(`Estado: ${sub.e} · CVU: ${sub.cbu}`, 14, 38);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        startY: 44,
        head: [["Fecha", "Hora", "Tipo", "Concepto", "TXID", "Monto"]],
        body: allMoves.map((m) => [
          m.fecha,
          m.hora,
          m.tipo === "ingreso" ? "Ingreso" : "Egreso",
          m.titulo,
          m.txid,
          m.monto.toFixed(2),
        ]),
        styles: { fontSize: 7 },
      });
      doc.save(`subcuenta-${nombre}.pdf`);
      toast.success("Reporte PDF descargado");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-card w-full sm:max-w-2xl lg:max-w-3xl max-h-[90vh] flex flex-col shadow-xl rounded-t-xl sm:rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b px-5 sm:px-6 py-4 flex items-center justify-between z-10 shrink-0">
          <h2 className="text-base font-semibold">Detalles de Subcuenta</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted transition text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-7">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Informacion general</h3>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    if (
                      confirmAction(
                        sub.e === "Activa" ? "pausar esta subcuenta" : "reactivar esta subcuenta",
                        "Los fondos quedaran " +
                          (sub.e === "Activa"
                            ? "congelados hasta que la reactives."
                            : "disponibles nuevamente."),
                      )
                    )
                      onCambiarEstado(sub.id!, sub.e === "Activa" ? "Pausada" : "Activa");
                  }}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-card hover:bg-muted transition text-muted-foreground hover:text-foreground"
                  title={sub.e === "Activa" ? "Deshabilitar cuenta" : "Reactivar cuenta"}
                >
                  <Pause size={13} />
                </button>
                <button
                  onClick={() => {
                    if (
                      confirmAction(
                        "eliminar esta subcuenta",
                        "Esta accion es irreversible. Todos los fondos seran transferidos a la cuenta madre.",
                      )
                    )
                      toast.success("Subcuenta eliminada (demo)");
                  }}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-card hover:bg-danger-50 hover:text-danger-600 transition text-muted-foreground"
                  title="Eliminar subcuenta"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Nombre
                  </span>
                  <p className="font-semibold mt-0.5">{sub.n}</p>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Email
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {editEmail ? (
                      <div className="flex items-center gap-1 flex-1">
                        <Input
                          value={emailVal}
                          onChange={(e) => setEmailVal(e.target.value)}
                          className="h-8 text-sm flex-1 min-w-0"
                        />
                        <button
                          onClick={() => {
                            setEditEmail(false);
                          }}
                          className="h-8 px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded border"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => {
                            setEditEmail(false);
                            setEmailVal(sub.email);
                          }}
                          className="h-8 px-2 text-xs text-muted-foreground hover:bg-muted rounded border"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-muted-foreground">{emailVal || "—"}</span>
                        <button
                          onClick={() => setEditEmail(true)}
                          className="text-muted-foreground hover:text-foreground transition"
                          title="Editar email"
                        >
                          <Pencil size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge tone={sub.e === "Activa" ? "success" : "warn"}>
                  {sub.e === "Activa" ? "Activo" : "Desactivado"}
                </Badge>
                <Badge tone={sub.retirosHab ? "success" : "neutral"}>
                  <Lock size={11} className="inline mr-0.5" /> Retiros{" "}
                  {sub.retirosHab ? "Habilitados" : "Deshabilitados"}
                </Badge>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Informacion financiera</h3>
              <button
                onClick={onFondear}
                className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-card hover:bg-muted transition text-muted-foreground hover:text-foreground"
                title="Mover fondos"
              >
                <Building2 size={13} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Balance actual
                </div>
                <div className="font-display tabular-nums text-base font-semibold mt-1">
                  {fmt(sub.disp)}
                </div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Total depositos
                </div>
                <div className="font-display tabular-nums text-base font-semibold mt-1 text-emerald-700">
                  {fmt(totalDepositos)}
                </div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Total retiros
                </div>
                <div className="font-display tabular-nums text-base font-semibold mt-1 text-danger-700">
                  {fmt(totalRetiros)}
                </div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Limite diario
                </div>
                <div
                  className={`font-display tabular-nums text-base font-semibold mt-1 ${sub.lim ? "" : "text-muted-foreground"}`}
                >
                  {fmtLimite(sub.lim)}
                </div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 sm:col-span-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    CVU
                  </span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-xs font-semibold truncate">
                      {sub.cbu || "Sin CVU"}
                    </span>
                    {sub.cbu && (
                      <button
                        onClick={() => copiarCvu(sub.cbu)}
                        className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                        title="Copiar CVU"
                      >
                        <Copy size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <h3 className="text-sm font-semibold">Historial de movimientos</h3>
              <div className="flex gap-2">
                <BtnOutline className="h-8 px-3 text-[11px]" onClick={onVerHistorial}>
                  <History size={12} /> HISTORIAL COMPLETO
                </BtnOutline>
                <BtnOutline
                  className="h-8 px-3 text-[11px]"
                  onClick={() => downloadReporte("excel")}
                >
                  <Download size={12} /> EXCEL
                </BtnOutline>
                <BtnOutline className="h-8 px-3 text-[11px]" onClick={() => downloadReporte("pdf")}>
                  <Download size={12} /> PDF
                </BtnOutline>
                <BtnOutline
                  className="h-8 px-3 text-[11px]"
                  onClick={() => setFilterOpen(!filterOpen)}
                >
                  <Filter size={12} /> FILTRAR
                  {filterOpen && <ChevronUp size={11} className="ml-1" />}
                </BtnOutline>
              </div>
            </div>

            {filterOpen && (
              <div className="mb-3 p-3 bg-muted/30 rounded-lg border space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      Buscar
                    </label>
                    <Input
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      placeholder="TXID, CVU o entidad..."
                      className="h-9 text-sm w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      Tipo
                    </label>
                    <select
                      value={filterTipo}
                      onChange={(e) =>
                        setFilterTipo(e.target.value as "todos" | "ingreso" | "egreso")
                      }
                      className="h-9 px-3 rounded-md border bg-card text-sm w-full"
                    >
                      <option value="todos">Todos</option>
                      <option value="ingreso">Ingresos</option>
                      <option value="egreso">Egresos</option>
                    </select>
                  </div>
                </div>
                {filtMoves.length < allMoves.length && (
                  <p className="text-[11px] text-muted-foreground">
                    {filtMoves.length} de {allMoves.length} movimientos
                  </p>
                )}
              </div>
            )}

            <div className="max-h-[280px] overflow-y-auto border rounded-lg divide-y">
              {loadingMoves ? (
                <p className="p-4 text-sm text-muted-foreground text-center">
                  Cargando movimientos…
                </p>
              ) : filtMoves.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">
                  Sin movimientos registrados
                </p>
              ) : (
                filtMoves.map((m, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 hover:bg-muted/30 transition">
                    <span
                      className="mt-0.5 h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center text-xs"
                      style={{
                        background:
                          m.tipo === "ingreso" ? "rgba(5,150,105,0.12)" : "rgba(220,38,38,0.12)",
                      }}
                    >
                      {m.tipo === "ingreso" ? (
                        <ArrowDownLeft size={15} className="text-emerald-700" />
                      ) : (
                        <ArrowUpRight size={15} className="text-danger-700" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="text-sm font-semibold">{m.titulo}</p>
                          <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                            {m.txid}
                          </p>
                        </div>
                        <span
                          className={`font-mono tabular-nums text-sm font-semibold whitespace-nowrap shrink-0 ${m.tipo === "ingreso" ? "text-emerald-700" : "text-danger-700"}`}
                        >
                          {fmtMov(m.tipo === "ingreso" ? m.monto : -m.monto)}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                        <span>CVU contraparte: {m.cbu}</span>
                        <span>{m.entidad}</span>
                        <span>
                          {m.fecha} · {m.hora}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
