import { createFileRoute } from "@tanstack/react-router";
import { resolveColor } from "@/brand/colors";
import { brand } from "@/brand/brand";
import { useState, useEffect, useCallback } from "react";
import {
  Download,
  Filter,
  FileText,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  Wallet,
  X,
  Eye,
  FileSpreadsheet,
  Share2,
} from "lucide-react";
import { PageHeader, Card, Input, BtnOutline, BtnPrimary, Badge } from "@/components/portal-shell";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { requireSupabase } from "@/lib/supabase";
import { descargarComprobantePdf } from "@/lib/comprobante-pdf";
import { compartirComprobante } from "@/lib/comprobante-imagen";
import type { DatosComprobante } from "@/lib/comprobante";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

// `?subcuenta=<nombre>` llega desde Subcuentas ("Ver historial") y preselecciona el filtro.
export const Route = createFileRoute("/app/historial")({
  validateSearch: (search: Record<string, unknown>): { subcuenta?: string } => ({
    subcuenta:
      typeof search.subcuenta === "string" && search.subcuenta ? search.subcuenta : undefined,
  }),
  component: Page,
});

const formatARS = (n: number) =>
  `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatFecha = (f: string | null) => {
  if (!f) return "—";
  const d = new Date(f);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

type Categoria =
  | "Ingresos"
  | "Egresos"
  | "Transferencias"
  | "Comisiones"
  | "Cobros con Tarjeta"
  | "Pagos con QR"
  | "Cobros con QR";

type Mov = {
  txid: string;
  tipo: "ingreso" | "egreso";
  categoria: string;
  titular: string;
  cuit: string;
  cbuCvu: string;
  fecha: string;
  /** Fecha cruda (ISO) para el comprobante, que la formatea él mismo. */
  fechaISO: string;
  monto: number;
  comision: number;
  impuesto: number;
  estado: "Acreditado" | "Pendiente" | "Rechazado";
  medio: string;
  referencia: string;
  usuario: string;
  numeroOp: string;
  canal: "Web" | "API" | "Movil";
  subcuenta: string;
  senderName: string;
  senderCuit: string;
  senderCbu: string;
  receiverName: string;
  receiverCuit: string;
  receiverCbu: string;
  receiverBanco: string;
  /**
   * La contraparte del movimiento, sin importar el sentido: en un egreso es el
   * destinatario y en un ingreso es quien transfirio.
   */
  contraparteNombre: string;
  contraparteCuit: string;
  contraparteBanco: string;
  /** CBU/CVU de la cuenta PROPIA que intervino (la de origen en un egreso). */
  subcuentaCbu: string;
};

type MovRow = {
  id_txn: string;
  tipo: string;
  cvu: string | null;
  monto_operacion: number;
  comision?: number | null;
  impuesto?: number | null;
  fecha: string | null;
  estado_codigo?: string;
  estado_nombre?: string;
  destinatario_nombre?: string | null;
  destinatario_cuit?: string | null;
  destinatario_banco?: string | null;
  /** Subcuenta del cliente que intervino (migracion 1020). */
  subcuenta_id?: string | null;
  subcuentas?: { cbu: string | null } | { cbu: string | null }[] | null;
  legajo: string;
};

function prettyTipo(tipo: string): string {
  const map: Record<string, string> = {
    cobro_pct: "Cobros con QR",
    cobro_link: "Cobros con Tarjeta",
    deposito: "Ingresos",
    transferencia: "Egresos",
    retiro: "Egresos",
    comision: "Comisiones",
    // Operaciones internas registradas por el ledger.
    liquidacion_lote: "Liquidación de lote",
    acreditacion_lote: "Acreditación de lote",
    adelanto: "Adelanto",
    ajuste_manual: "Ajuste de saldo",
  };
  return map[tipo] ?? (tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : "Movimiento");
}

// APROBADO = la operacion se completo (lo usa el banco y nuestras RPC), asi que
// tambien cuenta como acreditado.
function estadoVisible(nombreOCodigo: string | null | undefined): Mov["estado"] {
  const e = (nombreOCodigo ?? "Pendiente").toLowerCase();
  if (e.includes("acredit") || e.includes("aprob")) return "Acreditado";
  if (e.includes("rechaz")) return "Rechazado";
  return "Pendiente";
}

function mapMov(r: MovRow): Mov {
  const tipo = /cobro|deposito|ingreso|liquidacion|acreditacion|adelanto/.test(r.tipo)
    ? "ingreso"
    : "egreso";
  const categoria = prettyTipo(r.tipo);
  const estado = estadoVisible(r.estado_nombre ?? r.estado_codigo);
  return {
    txid: r.id_txn,
    tipo,
    categoria,
    titular: r.legajo,
    cuit: "—",
    cbuCvu: r.cvu ?? "—",
    fecha: formatFecha(r.fecha),
    fechaISO: r.fecha ?? "",
    monto: Number(r.monto_operacion) || 0,
    comision: Number(r.comision) || 0,
    impuesto: Number(r.impuesto) || 0,
    estado,
    medio: categoria,
    referencia: r.id_txn,
    usuario: "Sistema",
    numeroOp: r.id_txn,
    canal: "Web",
    subcuenta: "—",
    senderName: tipo === "ingreso" ? r.legajo : brand.name,
    senderCuit: "—",
    senderCbu: r.cvu ?? "—",
    receiverName: tipo === "ingreso" ? brand.name : (r.destinatario_nombre ?? ""),
    receiverCuit: tipo === "ingreso" ? "—" : (r.destinatario_cuit ?? ""),
    receiverCbu: r.cvu ?? "—",
    receiverBanco: tipo === "ingreso" ? "" : (r.destinatario_banco ?? ""),
    // Mismo dato sin importar el sentido: el comprobante lo usa para la contraparte.
    contraparteNombre: r.destinatario_nombre ?? "",
    contraparteCuit: r.destinatario_cuit ?? "",
    contraparteBanco: r.destinatario_banco ?? "",
    subcuentaCbu: (Array.isArray(r.subcuentas) ? r.subcuentas[0]?.cbu : r.subcuentas?.cbu) ?? "",
  };
}

/**
 * Datos del comprobante de un movimiento del historial.
 *
 * Solo se completan los datos que realmente tenemos: la contraparte de una
 * transferencia (nombre y CUIT del destinatario) no se guarda en `movimientos`,
 * así que va vacía — nunca se inventa.
 */
function comprobanteDeMov(
  m: Mov,
  cliente: { nombre: string; cuit: string; cbu: string },
): DatosComprobante {
  const esEgreso = m.tipo === "egreso";
  // La cuenta propia sale del movimiento (migracion 1020); si es viejo y no la
  // tiene, se usa el CBU del cliente que se pudo resolver.
  const yo = { nombre: cliente.nombre, cuit: cliente.cuit, cbu: m.subcuentaCbu || cliente.cbu };
  const otro = {
    nombre: m.contraparteNombre,
    cuit: m.contraparteCuit,
    cbu: m.cbuCvu === "—" ? "" : m.cbuCvu,
    banco: m.contraparteBanco || undefined,
  };
  return {
    fecha: m.fechaISO,
    monto: m.monto,
    comision: m.comision,
    impuesto: m.impuesto,
    estado: m.estado,
    txid: m.txid,
    // "Yo" es el dueño de la cuenta: en un egreso soy el origen, en un ingreso el destino.
    desde: esEgreso ? yo : otro,
    hacia: esEgreso ? otro : yo,
  };
}

// ---------------------------------------------------------------------------
// Movimientos por linea (vista v_transaction_lines): cada operacion trae una
// fila por concepto (ingreso/egreso, comision, impuesto, interes) con el mismo
// TXID. Sale del ledger, asi que filtros y paginacion corren en la base.
// ---------------------------------------------------------------------------
type TipoLinea = "ingreso" | "egreso" | "comision" | "impuesto" | "interes" | "reverso";

type Linea = {
  lineId: string;
  transactionId: string;
  idTxn: string;
  legajo: string;
  tipoOperacion: string;
  tipoLinea: TipoLinea;
  monto: number;
  fecha: string;
  lineNo: number;
  cvu: string | null;
  email: string | null;
  nombre: string | null;
  nombreDestino: string | null;
  cuit: string | null;
  estado: Mov["estado"];
};

const LINEA_COLS =
  "line_id, transaction_id, id_txn, legajo, tipo_operacion, tipo_linea, monto, fecha, line_no, cvu, email, nombre, nombre_destino, cuit, estado_codigo, estado_nombre";

const TIPOS_LINEA: Array<{ k: TipoLinea | "Todos"; l: string }> = [
  { k: "Todos", l: "Todos" },
  { k: "ingreso", l: "Ingreso" },
  { k: "egreso", l: "Egreso" },
  { k: "comision", l: "Comisión" },
  { k: "impuesto", l: "Impuesto" },
  { k: "interes", l: "Interés" },
  { k: "reverso", l: "Reverso" },
];
const TIPO_LINEA_LABEL = new Map(TIPOS_LINEA.map((t) => [t.k, t.l]));
const TIPO_LINEA_STYLE: Record<TipoLinea, string> = {
  ingreso: "bg-emerald-50 text-emerald-700 border-emerald-200",
  egreso: "bg-danger-50 text-danger-700 border-danger-200",
  comision: "bg-amber-50 text-amber-700 border-amber-200",
  impuesto: "bg-violet-50 text-violet-700 border-violet-200",
  interes: "bg-sky-50 text-sky-700 border-sky-200",
  reverso: "bg-slate-100 text-slate-700 border-slate-300",
};

/** Operacion de negocio (transactions.tipo) que origino las lineas. */
const OPERACIONES: Array<{ k: string; l: string; tipos: string[] | null }> = [
  { k: "Todas", l: "Todas", tipos: null },
  { k: "Transferencias", l: "Transferencias", tipos: ["transferencia"] },
  { k: "Depositos", l: "Depósitos", tipos: ["deposito"] },
  { k: "Retiros", l: "Retiros", tipos: ["retiro"] },
  { k: "Cobros con Tarjeta", l: "Cobros con Tarjeta", tipos: ["cobro_link", "tarjeta"] },
  { k: "Cobros con QR", l: "Cobros con QR", tipos: ["cobro_pct"] },
  { k: "Pagos con QR", l: "Pagos con QR", tipos: ["pago_pct"] },
  { k: "Liquidaciones", l: "Liquidación de lote", tipos: ["liquidacion_lote"] },
  { k: "Acreditaciones", l: "Acreditación de lote", tipos: ["acreditacion_lote"] },
  { k: "Adelantos", l: "Adelantos", tipos: ["adelanto"] },
  { k: "Ajustes", l: "Ajustes de saldo", tipos: ["ajuste_manual"] },
];

const formatMonto = (n: number) => `${n >= 0 ? "+" : "-"} ${formatARS(Math.abs(n))}`;
const formatFechaLinea = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

// Operacion completa (para detalle y comprobante).
const COLS_OPERACION =
  "id_txn, tipo, cvu, monto_operacion, comision, impuesto, fecha, legajo, destinatario_nombre, destinatario_cuit, destinatario_banco, subcuenta_id, subcuentas:subaccounts(cbu), estados_movimiento(codigo, nombre)";

function Page() {
  const [vista, setVista] = useState<"principal" | "sub">("principal");
  const [sub, setSub] = useState("");
  const [preview, setPreview] = useState(false);
  const [detalle, setDetalle] = useState<Mov | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [categoria, setCategoria] = useState("Todas");
  const [tipoLinea, setTipoLinea] = useState<TipoLinea | "Todos">("Todos");
  const [agrupar, setAgrupar] = useState(true);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const { subcuenta: subcuentaInicial } = Route.useSearch();
  const [subFiltro, setSubFiltro] = useState(subcuentaInicial ?? "Todas");
  const [buscarCbu, setBuscarCbu] = useState("");
  const [buscarCuit, setBuscarCuit] = useState("");
  const [buscarTxid, setBuscarTxid] = useState("");
  const [buscarTitular, setBuscarTitular] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const serie = "RP-EMP-2026-" + Math.floor(100000 + Math.random() * 899999);

  const [lineas, setLineas] = useState<Linea[]>([]);
  const [subcuentas, setSubcuentas] = useState<
    { id: string; nombre: string; cbu: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [sinSubcuentas, setSinSubcuentas] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteCuit, setClienteCuit] = useState("");
  /** CBU/CVU de la cuenta del cliente (para el comprobante). */
  const [clienteCbu, setClienteCbu] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const sb = requireSupabase();
      const {
        data: { user },
      } = await sb.auth.getUser();
      const { data: cli } = await sb
        .from("clientes")
        .select("legajo, tipo_persona, nombre, cuit, cuit_cuil, correo")
        .eq("correo", user?.email ?? "")
        .maybeSingle();
      const legajo = cli?.legajo;
      setClienteNombre(String(cli?.nombre ?? ""));
      setClienteCuit(String(cli?.cuit ?? "") || String(cli?.cuit_cuil ?? ""));
      if (!legajo) {
        setLineas([]);
        setSubcuentas([]);
        setSinSubcuentas(true);
        setTotalCount(0);
        return;
      }

      const { data: subs } = await sb
        .from("subaccounts")
        .select("id, nombre, cbu")
        .eq("cliente_legajo", legajo)
        .order("nombre", { ascending: true });
      const lista = (subs ?? []).map((s: any) => ({
        id: s.id as string,
        nombre: s.nombre || "Sin nombre",
        cbu: s.cbu ?? null,
      }));
      setSubcuentas(lista);
      setSinSubcuentas(lista.length === 0);
      // CBU para el comprobante: si el cliente tiene una sola cuenta (o todas con
      // el mismo CVU, como en el sandbox) se usa esa; si tiene varias distintas no
      // se puede saber cual se uso, asi que queda vacio (el movimiento no la guarda).
      const cbues = [...new Set(lista.map((s) => s.cbu).filter(Boolean))];
      setClienteCbu(cbues.length === 1 ? String(cbues[0]) : "");
      if (lista.length > 0 && !sub) setSub(lista[0].nombre);

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const like = (v: string) => `%${v.trim().replace(/[%_,()]/g, "\\$&")}%`;

      let q: any = sb
        .from("v_transaction_lines")
        .select(LINEA_COLS, { count: "exact" })
        .eq("legajo", legajo);

      if (desde) q = q.gte("fecha", new Date(desde + "T00:00:00").toISOString());
      if (hasta) q = q.lte("fecha", new Date(hasta + "T23:59:59").toISOString());

      const tipos = OPERACIONES.find((o) => o.k === categoria)?.tipos ?? null;
      if (tipos)
        q = tipos.length === 1 ? q.eq("tipo_operacion", tipos[0]) : q.in("tipo_operacion", tipos);
      if (tipoLinea !== "Todos") q = q.eq("tipo_linea", tipoLinea);

      if (subFiltro !== "Todas") {
        const match = lista.find((s) => s.nombre === subFiltro);
        if (match) q = q.eq("subaccount_id", match.id);
      }

      if (buscarCbu.trim())
        q = q.or(`cvu.ilike.${like(buscarCbu)},cvu_propio.ilike.${like(buscarCbu)}`);
      if (buscarTxid.trim()) q = q.ilike("id_txn", like(buscarTxid));
      if (buscarTitular.trim()) q = q.ilike("nombre_destino", like(buscarTitular));
      const cuitDigitos = buscarCuit.replace(/\D/g, "");
      if (cuitDigitos) q = q.ilike("cuit", like(cuitDigitos));

      // Mas reciente primero; dentro de una operacion, en el orden de sus lineas.
      const { data, count, error } = await q
        .order("fecha", { ascending: false })
        .order("id_txn", { ascending: true })
        .order("line_no", { ascending: true })
        .range(from, to);
      if (error) throw error;

      setLineas(
        (data ?? []).map((r: any): Linea => ({
          lineId: r.line_id,
          transactionId: r.transaction_id,
          idTxn: r.id_txn,
          legajo: r.legajo,
          tipoOperacion: r.tipo_operacion,
          tipoLinea: r.tipo_linea,
          monto: Number(r.monto) || 0,
          fecha: r.fecha,
          lineNo: r.line_no,
          cvu: r.cvu,
          email: r.email,
          nombre: r.nombre,
          nombreDestino: r.nombre_destino,
          cuit: r.cuit,
          estado: estadoVisible(r.estado_nombre ?? r.estado_codigo),
        })),
      );
      setTotalCount(count ?? 0);
    } catch (e) {
      toast.error("No se pudieron cargar los movimientos");
      setLineas([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    desde,
    hasta,
    categoria,
    tipoLinea,
    subFiltro,
    buscarCbu,
    buscarCuit,
    buscarTxid,
    buscarTitular,
    sub,
  ]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    setPage(1);
  }, [
    desde,
    hasta,
    categoria,
    tipoLinea,
    subFiltro,
    buscarCbu,
    buscarCuit,
    buscarTxid,
    buscarTitular,
  ]);

  // Agrupacion por TXID dentro de la pagina: la primera linea de cada operacion
  // encabeza el grupo y el resto (comision, impuesto, ...) se despliega.
  const filas = (() => {
    const cantidad = new Map<string, number>();
    for (const l of lineas) cantidad.set(l.idTxn, (cantidad.get(l.idTxn) ?? 0) + 1);
    const vistos = new Set<string>();
    const out: Array<Linea & { esCabeza: boolean; hijas: number }> = [];
    for (const l of lineas) {
      const esCabeza = !vistos.has(l.idTxn);
      vistos.add(l.idTxn);
      if (!agrupar) out.push({ ...l, esCabeza: false, hijas: 0 });
      else if (esCabeza)
        out.push({ ...l, esCabeza: true, hijas: (cantidad.get(l.idTxn) ?? 1) - 1 });
      else if (abiertos.has(l.idTxn)) out.push({ ...l, esCabeza: false, hijas: 0 });
    }
    return out;
  })();

  const toggleGrupo = (idTxn: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(idTxn)) next.delete(idTxn);
      else next.add(idTxn);
      return next;
    });

  // Totales de la pagina: el signo ya viene de la base.
  const totalIngresos = lineas.filter((l) => l.monto > 0).reduce((s, l) => s + l.monto, 0);
  const totalEgresos = lineas.filter((l) => l.monto < 0).reduce((s, l) => s - l.monto, 0);
  const txPendientes = new Set(lineas.filter((l) => l.estado === "Pendiente").map((l) => l.idTxn));
  const txRechazadas = new Set(lineas.filter((l) => l.estado === "Rechazado").map((l) => l.idTxn));
  const totalPendientes = txPendientes.size + txRechazadas.size;

  /** Operacion completa de una linea (detalle y comprobante). */
  const cargarOperacion = async (l: Linea): Promise<Mov | null> => {
    try {
      const sb = requireSupabase();
      const { data: m, error } = await sb
        .from("transactions")
        .select(COLS_OPERACION)
        .eq("id", l.transactionId)
        .maybeSingle();
      if (error || !m) throw error ?? new Error("no encontrada");
      const r = m as any;
      return mapMov({
        id_txn: r.id_txn,
        tipo: r.tipo,
        cvu: r.cvu,
        monto_operacion: r.monto_operacion,
        comision: r.comision,
        impuesto: r.impuesto,
        fecha: r.fecha,
        legajo: r.legajo,
        estado_codigo: r.estados_movimiento?.codigo,
        estado_nombre: r.estados_movimiento?.nombre,
        destinatario_nombre: r.destinatario_nombre,
        destinatario_cuit: r.destinatario_cuit,
        destinatario_banco: r.destinatario_banco,
        subcuenta_id: r.subcuenta_id,
        subcuentas: r.subcuentas,
      });
    } catch {
      toast.error("No se pudo cargar la operación");
      return null;
    }
  };

  const verDetalle = async (l: Linea) => {
    const m = await cargarOperacion(l);
    if (m) setDetalle(m);
  };

  const descargarComprobante = async (l: Linea) => {
    const m = await cargarOperacion(l);
    if (!m) return;
    descargarComprobantePdf(
      comprobanteDeMov(m, { nombre: clienteNombre, cuit: clienteCuit, cbu: clienteCbu }),
    );
    toast.success("Comprobante descargado");
  };

  const compartir = async (l: Linea) => {
    const m = await cargarOperacion(l);
    if (!m) return;
    const res = await compartirComprobante(
      comprobanteDeMov(m, { nombre: clienteNombre, cuit: clienteCuit, cbu: clienteCbu }),
    );
    if (res === "compartido") toast.success("Comprobante compartido");
    else if (res === "descargado")
      toast.info("Tu navegador no comparte archivos: se descargó el comprobante para adjuntarlo.");
    else if (res === "error") toast.error("No se pudo compartir el comprobante");
  };

  function limpiarFiltros() {
    setDesde("");
    setHasta("");
    setCategoria("Todas");
    setTipoLinea("Todos");
    setSubFiltro("Todas");
    setBuscarCbu("");
    setBuscarCuit("");
    setBuscarTxid("");
    setBuscarTitular("");
  }

  const exportExcel = () => {
    const body = lineas.map((l) => ({
      Legajo: l.legajo,
      TXID: l.idTxn,
      Tipo: TIPO_LINEA_LABEL.get(l.tipoLinea) ?? l.tipoLinea,
      Operacion: prettyTipo(l.tipoOperacion),
      CVU: l.cvu ?? "",
      Email: l.email ?? "",
      Nombre: l.nombre ?? "",
      Nombre_destino: l.nombreDestino ?? "",
      CUIT: l.cuit ?? "",
      Monto: l.monto,
      Fecha: formatFechaLinea(l.fecha),
      Estado: l.estado,
    }));
    const ws = XLSX.utils.json_to_sheet([
      { Resumen: "Ingresos", Valor: formatARS(totalIngresos) },
      { Resumen: "Egresos", Valor: formatARS(totalEgresos) },
      { Resumen: "Neto", Valor: formatARS(totalIngresos - totalEgresos) },
      { Resumen: "Pendientes/Rechazados", Valor: String(totalPendientes) },
      {},
      ...body,
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, `historial-movimientos-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel descargado");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFillColor(...resolveColor("primary"));
    doc.rect(0, 0, 210, 26, "F");
    doc.setTextColor(...resolveColor("on-primary"));
    doc.setFontSize(16);
    doc.text(brand.name, 14, 17);
    doc.setFontSize(9);
    doc.text("Reporte de movimientos", 14, 23);
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString("es-AR")}`, 196, 17, { align: "right" });
    doc.text(serie, 196, 23, { align: "right" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      startY: 34,
      head: [["Ingresos", "Egresos", "Neto", "Pendientes/Rechazados"]],
      body: [
        [
          formatARS(totalIngresos),
          formatARS(totalEgresos),
          formatARS(totalIngresos - totalEgresos),
          String(totalPendientes),
        ],
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      startY: 52,
      head: [["TXID", "Fecha", "Tipo", "Operacion", "Nombre destino", "CUIT", "Monto", "Estado"]],
      body: lineas.map((l) => [
        l.idTxn,
        formatFechaLinea(l.fecha),
        TIPO_LINEA_LABEL.get(l.tipoLinea) ?? l.tipoLinea,
        prettyTipo(l.tipoOperacion),
        l.nombreDestino ?? "-",
        l.cuit ?? "-",
        l.monto.toFixed(2),
        l.estado,
      ]),
      styles: { fontSize: 7 },
    });
    doc.save(`historial-movimientos-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF descargado");
  };

  return (
    <>
      <PageHeader
        title="Historial"
        description="Auditoria completa de movimientos con filtros, exportacion y detalle de transacciones."
        action={
          <div className="flex gap-2">
            <BtnOutline onClick={exportExcel}>
              <FileSpreadsheet size={14} /> Excel
            </BtnOutline>
            <BtnPrimary onClick={exportPDF}>
              <Download size={14} /> PDF
            </BtnPrimary>
          </div>
        }
      />

      {/* Vista tabs */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Wallet size={14} className="text-muted-foreground" />
            <span className="font-semibold">Vista:</span>
          </div>
          <div className="flex gap-1.5">
            {(
              [
                ["principal", "Cuenta principal"],
                ["sub", "Por subcuenta"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setVista(k)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition ${
                  vista === k
                    ? "bg-[color:var(--brand-primary-50)] text-[color:var(--brand-primary-700)] border-transparent"
                    : "bg-card hover:bg-muted"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {vista === "sub" &&
            (sinSubcuentas ? (
              <span className="text-xs text-muted-foreground">Sin subcuentas asociadas</span>
            ) : (
              <select
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                className="h-9 px-3 rounded-md border bg-card text-sm"
              >
                {subcuentas.map((s) => (
                  <option key={s.nombre}>{s.nombre}</option>
                ))}
              </select>
            ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {vista === "principal"
              ? "Mostrando consolidado de cuenta madre"
              : sinSubcuentas
                ? "Sin subcuentas asociadas"
                : `Filtrando movimientos de ${sub}`}
          </span>
        </div>
      </Card>

      {/* KPIs resumen */}
      <div className="grid md:grid-cols-4 gap-5 mb-6">
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">Ingresos del periodo</div>
          <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-emerald-700">
            {formatARS(totalIngresos)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {lineas.filter((l) => l.monto > 0).length} líneas
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">Egresos del periodo</div>
          <div className="text-xl md:text-2xl font-bold text-foreground">
            {formatARS(totalEgresos)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {lineas.filter((l) => l.monto < 0).length} líneas (incluye comisiones e impuestos)
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">Neto</div>
          <div
            className={`font-display tabular-nums text-xl md:text-2xl font-bold ${totalIngresos - totalEgresos >= 0 ? "text-emerald-700" : "text-danger-600"}`}
          >
            {totalIngresos - totalEgresos >= 0 ? "+ " : "- "}
            {formatARS(Math.abs(totalIngresos - totalEgresos))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">Pendientes / Rechazados</div>
          <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-foreground">
            {totalPendientes}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {txPendientes.size} pendientes, {txRechazadas.size} rechazadas
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4 mb-5">
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Fecha de inicio
            </label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Fecha de fin
            </label>
            <Input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              min={desde || undefined}
            />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Tipo de movimiento
            </label>
            <select
              value={tipoLinea}
              onChange={(e) => setTipoLinea(e.target.value as TipoLinea | "Todos")}
              className="h-10 px-3 rounded-md border bg-card text-sm w-full sm:w-auto sm:min-w-[150px]"
            >
              {TIPOS_LINEA.map(({ k, l }) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Operación
            </label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="h-10 px-3 rounded-md border bg-card text-sm w-full sm:w-auto sm:min-w-[170px]"
            >
              {OPERACIONES.map(({ k, l }) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Subcuenta
            </label>
            {sinSubcuentas ? (
              <span className="inline-flex h-10 items-center text-xs text-muted-foreground">
                Sin subcuentas asociadas
              </span>
            ) : (
              <select
                value={subFiltro}
                onChange={(e) => setSubFiltro(e.target.value)}
                className="h-10 px-3 rounded-md border bg-card text-sm w-full sm:w-auto sm:min-w-[150px]"
              >
                <option value="Todas">Todas</option>
                {subcuentas.map((s) => (
                  <option key={s.nombre}>{s.nombre}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="border-t pt-4 mb-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Busquedas especificas
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">CBU / CVU</label>
              <Input
                placeholder="Buscar por CBU/CVU..."
                value={buscarCbu}
                onChange={(e) => setBuscarCbu(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">CUIT</label>
              <Input
                placeholder="Buscar por CUIT..."
                value={buscarCuit}
                onChange={(e) => setBuscarCuit(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                TXID / N° Operacion
              </label>
              <Input
                placeholder="Buscar por TXID..."
                value={buscarTxid}
                onChange={(e) => setBuscarTxid(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Nombre destino</label>
              <Input
                placeholder="Buscar por nombre destino..."
                value={buscarTitular}
                onChange={(e) => setBuscarTitular(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center border-t pt-4">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{loading ? "Cargando..." : `${totalCount} líneas`}</span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={agrupar}
                onChange={(e) => setAgrupar(e.target.checked)}
              />
              Agrupar desglose por TXID
            </label>
          </div>
          <div className="flex gap-2">
            <BtnOutline className="h-8 px-4 text-xs" onClick={limpiarFiltros}>
              Limpiar filtros
            </BtnOutline>
            <BtnOutline className="h-8 px-4 text-xs" onClick={exportExcel}>
              <FileSpreadsheet size={13} /> Excel
            </BtnOutline>
            <BtnPrimary className="h-8 px-4 text-xs" onClick={exportPDF}>
              <Download size={13} /> PDF
            </BtnPrimary>
          </div>
        </div>
      </Card>

      {/* Tabla */}
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
                <th className="text-left px-4 py-3 font-semibold">Legajo</th>
                <th className="text-left px-4 py-3 font-semibold">ID transacción</th>
                <th className="text-left px-4 py-3 font-semibold">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold">CVU</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>
                <th className="text-left px-4 py-3 font-semibold">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold">Nombre destino</th>
                <th className="text-left px-4 py-3 font-semibold">CUIT</th>
                <th className="text-right px-4 py-3 font-semibold">Monto</th>
                <th className="text-left px-4 py-3 font-semibold">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filas.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-sm text-muted-foreground">
                    Sin datos registrados.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-sm text-muted-foreground">
                    Cargando movimientos...
                  </td>
                </tr>
              )}
              {!loading &&
                filas.map((l) => {
                  const hija = agrupar && !l.esCabeza;
                  return (
                    <tr
                      key={`${l.lineId}:${l.lineNo}`}
                      className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${hija ? "bg-muted/20" : ""}`}
                    >
                      <td className="px-4 py-3 text-xs font-mono tabular-nums whitespace-nowrap">
                        {l.legajo}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setBuscarTxid(l.idTxn)}
                          className="text-xs font-mono text-muted-foreground hover:text-foreground hover:underline underline-offset-2 text-left"
                          title="Ver todas las líneas de esta operación"
                        >
                          {l.idTxn}
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {l.esCabeza && l.hijas > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleGrupo(l.idTxn)}
                              className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                              title={
                                abiertos.has(l.idTxn)
                                  ? "Ocultar desglose"
                                  : `Ver desglose (${l.hijas})`
                              }
                            >
                              {abiertos.has(l.idTxn) ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronRight size={14} />
                              )}
                            </button>
                          ) : (
                            <span
                              className={hija ? "w-5 h-5 ml-2 border-l-2 border-muted" : "w-5"}
                            />
                          )}
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TIPO_LINEA_STYLE[l.tipoLinea]}`}
                          >
                            {TIPO_LINEA_LABEL.get(l.tipoLinea) ?? l.tipoLinea}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 ml-6">
                          {prettyTipo(l.tipoOperacion)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {l.cvu || "-"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[200px]">
                        {l.email || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm truncate max-w-[180px]">
                        {l.nombre || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium truncate max-w-[200px]">
                        {l.nombreDestino || "-"}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                        {l.cuit || "-"}
                      </td>
                      <td
                        className={`px-4 py-3 font-mono tabular-nums text-right font-semibold whitespace-nowrap text-sm ${l.monto >= 0 ? "text-emerald-700" : "text-danger-700"}`}
                      >
                        {formatMonto(l.monto)}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {formatFechaLinea(l.fecha)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            l.estado === "Acreditado"
                              ? "success"
                              : l.estado === "Pendiente"
                                ? "warn"
                                : "danger"
                          }
                        >
                          {l.estado}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            title="Ver detalle de la operación"
                            onClick={() => void verDetalle(l)}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border bg-card hover:bg-accent hover:border-primary/40 transition"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            title="Descargar comprobante"
                            onClick={() => void descargarComprobante(l)}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border bg-card hover:bg-accent hover:border-primary/40 transition"
                          >
                            <FileText size={14} />
                          </button>
                          <button
                            title="Compartir comprobante"
                            onClick={() => void compartir(l)}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border bg-card hover:bg-accent hover:border-primary/40 transition"
                          >
                            <Share2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t text-xs text-muted-foreground">
          <div>
            {totalCount === 0
              ? "0 registros"
              : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} de ${totalCount}`}
          </div>
          <div className="flex gap-2">
            <BtnOutline
              className="h-8 px-4 text-xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </BtnOutline>
            <BtnOutline
              className="h-8 px-4 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Siguiente
            </BtnOutline>
          </div>
        </div>
      </Card>

      {/* Comprobante / Detalle */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetalle(null)} />
          <div className="relative bg-card rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-card border-b px-6 py-4 flex justify-between items-center z-10 rounded-t-xl">
              <div className="font-semibold">Comprobante de transaccion</div>
              <button
                onClick={() => setDetalle(null)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-accent transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4 pb-5 border-b">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    detalle.tipo === "ingreso"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-danger-50 text-danger-600"
                  }`}
                >
                  {detalle.tipo === "ingreso" ? (
                    <ArrowDownLeft size={26} />
                  ) : (
                    <ArrowUpRight size={26} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl font-bold">
                    {detalle.tipo === "ingreso" ? "Recibiste dinero" : "Enviaste dinero"}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <span>{detalle.medio}</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                    <span>{detalle.fecha}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-end justify-between pb-5 border-b">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Monto</div>
                  <div
                    className={`font-display tabular-nums text-2xl font-bold ${detalle.tipo === "ingreso" ? "text-emerald-700" : ""}`}
                  >
                    {detalle.tipo === "ingreso"
                      ? "+ " + formatARS(detalle.monto)
                      : detalle.categoria === "Transferencias" || detalle.categoria === "Egresos"
                        ? "- " +
                          formatARS(
                            detalle.monto + (detalle.comision || 0) + (detalle.impuesto || 0),
                          )
                        : "- " + formatARS(detalle.monto)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground mb-1">Estado</div>
                  <Badge
                    tone={
                      detalle.estado === "Acreditado"
                        ? "success"
                        : detalle.estado === "Pendiente"
                          ? "warn"
                          : "danger"
                    }
                  >
                    {detalle.estado}
                  </Badge>
                </div>
              </div>

              <div className="pb-5 border-b">
                <div className="text-xs text-muted-foreground mb-1">TXID</div>
                <div className="font-mono text-sm font-medium break-all">{detalle.txid}</div>
              </div>

              <div className="pb-5 border-b">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Desde
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Nombre</div>
                    <div className="font-medium truncate">{detalle.senderName}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">CUIT</div>
                    <div className="font-mono text-xs">{detalle.senderCuit}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">CBU / CVU</div>
                    <div className="font-mono text-xs truncate">{detalle.senderCbu}</div>
                  </div>
                </div>
              </div>

              <div className="pb-5 border-b">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Hacia
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Nombre</div>
                    <div className="font-medium truncate">{detalle.receiverName}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">CUIT</div>
                    <div className="font-mono text-xs">{detalle.receiverCuit}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">CBU / CVU</div>
                    <div className="font-mono text-xs truncate">{detalle.receiverCbu}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Banco</div>
                    <div className="font-medium truncate">{detalle.receiverBanco || "—"}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm pb-2">
                <div>
                  <div className="text-xs text-muted-foreground">N° de operacion</div>
                  <div className="font-medium">{detalle.numeroOp}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Referencia</div>
                  <div className="font-mono text-xs">{detalle.referencia}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Canal de origen</div>
                  <div>{detalle.canal}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Usuario</div>
                  <div>{detalle.usuario}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Subcuenta</div>
                  <div>{detalle.subcuenta}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Categoria</div>
                  <div>{detalle.categoria}</div>
                </div>
                {(detalle.categoria === "Transferencias" || detalle.categoria === "Egresos") && (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Comisión</div>
                      <div className="font-mono">{formatARS(detalle.comision)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">IVA</div>
                      <div className="font-mono">{formatARS(detalle.impuesto)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Monto debitado</div>
                      <div className="font-mono font-semibold">
                        {formatARS(
                          detalle.monto + (detalle.comision || 0) + (detalle.impuesto || 0),
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <BtnPrimary
                  className="flex-1"
                  onClick={() => {
                    descargarComprobantePdf(
                      comprobanteDeMov(detalle, {
                        nombre: clienteNombre,
                        cuit: clienteCuit,
                        cbu: clienteCbu,
                      }),
                    );
                    toast.success("Comprobante descargado");
                  }}
                >
                  <Download size={15} /> Descargar comprobante
                </BtnPrimary>
                <BtnOutline
                  className="flex-1"
                  onClick={async () => {
                    const res = await compartirComprobante(
                      comprobanteDeMov(detalle, {
                        nombre: clienteNombre,
                        cuit: clienteCuit,
                        cbu: clienteCbu,
                      }),
                    );
                    if (res === "compartido") toast.success("Comprobante compartido");
                    else if (res === "descargado")
                      toast.info(
                        "Tu navegador no comparte archivos: se descargó el comprobante para adjuntarlo.",
                      );
                    else if (res === "error") toast.error("No se pudo compartir el comprobante");
                  }}
                >
                  <Share2 size={15} /> Compartir comprobante
                </BtnOutline>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview reporte */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPreview(false)} />
          <div className="relative bg-card rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-card border-b px-6 py-4 flex justify-between items-center z-10 rounded-t-xl">
              <div className="font-semibold">Vista previa del reporte</div>
              <BtnOutline className="h-8 px-4 text-xs" onClick={() => setPreview(false)}>
                Cerrar
              </BtnOutline>
            </div>
            <div className="p-8 space-y-5">
              <div className="flex items-center justify-between border-b pb-5">
                <BrandLogo />
                <div className="text-right text-xs text-muted-foreground">
                  <div className="font-mono font-semibold text-foreground">{serie}</div>
                  <div>Generado: {new Date().toLocaleString("es-AR")}</div>
                </div>
              </div>
              <h2 className="text-xl font-semibold">Reporte de movimientos</h2>
              <div className="text-sm text-muted-foreground">
                {vista === "principal"
                  ? "Cuenta principal (consolidado)"
                  : sinSubcuentas
                    ? "Sin subcuentas asociadas"
                    : `Subcuenta: ${sub}`}
                {categoria !== "Todas" && ` · Categoria: ${categoria}`}
              </div>
              <Card className="bg-muted/30 p-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Ingresos</div>
                    <div className="font-display tabular-nums font-semibold">
                      {formatARS(totalIngresos)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Egresos</div>
                    <div className="font-display tabular-nums font-semibold">
                      {formatARS(totalEgresos)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Neto</div>
                    <div className="font-display tabular-nums font-semibold text-emerald-700">
                      {totalIngresos - totalEgresos >= 0 ? "+ " : "- "}
                      {formatARS(Math.abs(totalIngresos - totalEgresos))}
                    </div>
                  </div>
                </div>
              </Card>
              <div className="text-xs text-muted-foreground border-t pt-4">
                Documento firmado digitalmente por {brand.name} · Serie {serie}
              </div>
              <div className="flex gap-3 pt-2">
                <BtnOutline
                  className="flex-1"
                  onClick={() => {
                    setPreview(false);
                    exportExcel();
                  }}
                >
                  <FileSpreadsheet size={14} /> Excel (.xlsx)
                </BtnOutline>
                <BtnPrimary
                  className="flex-1"
                  onClick={() => {
                    setPreview(false);
                    exportPDF();
                  }}
                >
                  <Download size={14} /> PDF
                </BtnPrimary>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
