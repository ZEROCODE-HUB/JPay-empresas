import { createFileRoute } from "@tanstack/react-router";
import { resolveColor } from "@/brand/colors";
import { brand } from "@/brand/brand";
import { useState, useEffect, useCallback } from "react";
import {
  Download, Filter, FileText, ArrowDownLeft, ArrowUpRight,
  ChevronRight, Wallet, X, Eye, FileSpreadsheet, Share2,
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

export const Route = createFileRoute("/app/historial")({ component: Page });

const formatARS = (n: number) =>
  `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatFecha = (f: string | null) => {
  if (!f) return "—";
  const d = new Date(f);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

type Categoria = "Ingresos" | "Egresos" | "Transferencias" | "Comisiones" | "Cobros con Tarjeta" | "Pagos con QR" | "Cobros con QR";

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
  };
  return map[tipo] ?? (tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : "Movimiento");
}

function mapMov(r: MovRow): Mov {
  const tipo = /cobro|deposito|ingreso/.test(r.tipo) ? "ingreso" : "egreso";
  const categoria = prettyTipo(r.tipo);
  const nombreEstado = (r.estado_nombre ?? r.estado_codigo ?? "Pendiente").toLowerCase();
  // APROBADO = la operacion se completo (lo usa el banco y nuestras RPC), asi que
  // tambien cuenta como acreditado: antes quedaba como "Pendiente".
  const estado: Mov["estado"] =
    nombreEstado.includes("acredit") || nombreEstado.includes("aprob")
      ? "Acreditado"
      : nombreEstado.includes("rechaz")
        ? "Rechazado"
        : "Pendiente";
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
    receiverName: tipo === "ingreso" ? brand.name : r.destinatario_nombre ?? "",
    receiverCuit: tipo === "ingreso" ? "—" : r.destinatario_cuit ?? "",
    receiverCbu: r.cvu ?? "—",
    receiverBanco: tipo === "ingreso" ? "" : r.destinatario_banco ?? "",
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
function comprobanteDeMov(m: Mov, cliente: { nombre: string; cuit: string; cbu: string }): DatosComprobante {
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

const CATEGORIAS: Array<{ k: string; l: string }> = [
  { k: "Todas", l: "Todas" },
  { k: "Ingresos", l: "Ingresos" },
  { k: "Egresos", l: "Egresos" },
  { k: "Transferencias", l: "Transferencias" },
  { k: "Comisiones", l: "Comisiones" },
  { k: "Cobros con Tarjeta", l: "Cobros con Tarjeta" },
  { k: "Pagos con QR", l: "Pagos con QR" },
  { k: "Cobros con QR", l: "Cobros con QR" },
];

function Page() {
  const [vista, setVista] = useState<"principal" | "sub">("principal");
  const [sub, setSub] = useState("");
  const [preview, setPreview] = useState(false);
  const [detalle, setDetalle] = useState<Mov | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [categoria, setCategoria] = useState("Todas");
  const [subFiltro, setSubFiltro] = useState("Todas");
  const [buscarCbu, setBuscarCbu] = useState("");
  const [buscarCuit, setBuscarCuit] = useState("");
  const [buscarTxid, setBuscarTxid] = useState("");
  const [buscarTitular, setBuscarTitular] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const serie = "RP-EMP-2026-" + Math.floor(100000 + Math.random() * 899999);

  const [movimientos, setMovimientos] = useState<Mov[]>([]);
  const [subcuentas, setSubcuentas] = useState<{ nombre: string; cbu: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sinSubcuentas, setSinSubcuentas] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteCuit, setClienteCuit] = useState("");
  /** CBU/CVU de la cuenta del cliente (para el comprobante). */
  const [clienteCbu, setClienteCbu] = useState("");

  const categoriaToTipos = (cat: string): string[] | null => {
    if (cat === "Todas") return null;
    if (cat === "Ingresos") return ["deposito"];
    if (cat === "Egresos") return ["transferencia", "retiro"];
    if (cat === "Transferencias") return ["transferencia"];
    if (cat === "Comisiones") return ["comision"];
    if (cat === "Cobros con Tarjeta") return ["cobro_link", "tarjeta"];
    if (cat === "Cobros con QR") return ["cobro_pct"];
    if (cat === "Pagos con QR") return ["pago_pct"];
    return null;
  };

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const sb = requireSupabase();
      const { data: { user } } = await sb.auth.getUser();
      const { data: cli } = await sb
        .from("clientes")
        .select("legajo, tipo_persona, nombre, cuit, cuit_cuil, correo")
        .eq("correo", user?.email ?? "")
        .maybeSingle();
      const legajo = cli?.legajo;
      setClienteNombre(String(cli?.nombre ?? ""));
      setClienteCuit(String(cli?.cuit ?? "") || String(cli?.cuit_cuil ?? ""));
      if (!legajo) {
        setMovimientos([]);
        setSubcuentas([]);
        setSinSubcuentas(true);
        setTotalCount(0);
        return;
      }

      const { data: subs } = await sb
        .from("subcuentas")
        .select("nombre, cbu")
        .eq("cliente_legajo", legajo)
        .order("nombre", { ascending: true });
      const lista = (subs ?? []).map((s: any) => ({ nombre: s.nombre || "Sin nombre", cbu: s.cbu ?? null }));
      setSubcuentas(lista);
      setSinSubcuentas(lista.length === 0);
      // CBU para el comprobante: si el cliente tiene una sola cuenta (o todas con
      // el mismo CVU, como en el sandbox) se usa esa; si tiene varias distintas no
      // se puede saber cual se uso, asi que queda vacio (el movimiento no la guarda).
      const cbues = [...new Set(lista.map((s) => s.cbu).filter(Boolean))];
      setClienteCbu(cbues.length === 1 ? String(cbues[0]) : "");
      if (lista.length > 0 && !sub) setSub(lista[0].nombre);

      const hasFilters = !!(desde || hasta || categoria !== "Todas" || subFiltro !== "Todas");
      const countMode = hasFilters ? "exact" as const : "estimated" as const;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // `subcuenta_id` / `subcuentas(cbu)` llegan con la migracion 1020. Si todavia
      // no corrio, se reintenta SIN esas columnas para no romper el historial.
      const COLS_CON_CVU =
        "id_txn, tipo, cvu, monto_operacion, comision, impuesto, fecha, legajo, destinatario_nombre, destinatario_cuit, destinatario_banco, subcuenta_id, subcuentas(cbu), estados_movimiento(codigo, nombre)";
      const COLS_BASE =
        "id_txn, tipo, cvu, monto_operacion, comision, impuesto, fecha, legajo, destinatario_nombre, destinatario_cuit, destinatario_banco, estados_movimiento(codigo, nombre)";

      const construirQuery = (cols: string) => {
        let q: any = sb
          .from("movimientos")
          .select(cols, { count: countMode })
          .eq("legajo", legajo)
          .order("fecha", { ascending: false })
          .range(from, to);

        if (desde) q = q.gte("fecha", new Date(desde + "T00:00:00").toISOString());
        if (hasta) q = q.lte("fecha", new Date(hasta + "T23:59:59").toISOString());

        const tipos = categoriaToTipos(categoria);
        if (tipos) q = tipos.length === 1 ? q.eq("tipo", tipos[0]) : q.in("tipo", tipos);

        if (subFiltro !== "Todas") {
          const match = lista.find((s) => s.nombre === subFiltro);
          if (match?.cbu) q = q.eq("cvu", match.cbu);
        }

        if (buscarCbu) q = q.ilike("cvu", `%${buscarCbu}%`);
        if (buscarTxid) q = q.ilike("id_txn", `%${buscarTxid}%`);
        if (buscarTitular) q = q.ilike("legajo", `%${buscarTitular}%`);
        if (buscarCuit) q = q.ilike("legajo", `%${buscarCuit}%`);
        return q;
      };

      let respuesta = await construirQuery(COLS_CON_CVU);
      if (respuesta.error) respuesta = await construirQuery(COLS_BASE);

      const { data: movs, count, error } = respuesta;
      if (error) throw error;
      const filas: MovRow[] = (movs ?? []).map((m: any) => ({
        id_txn: m.id_txn,
        tipo: m.tipo,
        cvu: m.cvu,
        monto_operacion: m.monto_operacion,
        comision: m.comision,
        impuesto: m.impuesto,
        fecha: m.fecha,
        legajo: m.legajo,
        estado_codigo: m.estados_movimiento?.codigo,
        estado_nombre: m.estados_movimiento?.nombre,
        destinatario_nombre: m.destinatario_nombre,
        destinatario_cuit: m.destinatario_cuit,
        destinatario_banco: m.destinatario_banco,
        // La subcuenta propia (con su CBU): sin esto el comprobante no puede
        // mostrar el CVU de origen (venia del select pero se perdia aca).
        subcuenta_id: m.subcuenta_id,
        subcuentas: m.subcuentas,
      }));
      setMovimientos(filas.map(mapMov));
      setTotalCount(count ?? filas.length);
    } catch (e) {
      toast.error("No se pudieron cargar los movimientos");
      setMovimientos([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, desde, hasta, categoria, subFiltro, buscarCbu, buscarCuit, buscarTxid, buscarTitular, sub]);

  useEffect(() => { cargar(); }, [cargar]);

  // Compatibilidad: filtered/paginated ahora reflejan paginación server-side
  const filtered = movimientos;
  const paginated = movimientos;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => { setPage(1); }, [desde, hasta, categoria, subFiltro, buscarCbu, buscarCuit, buscarTxid, buscarTitular]);

  const totalIngresos = filtered.filter((r) => r.tipo === "ingreso").reduce((s, r) => s + r.monto, 0);
  const totalEgresos = filtered.filter((r) => r.tipo === "egreso").reduce((s, r) => s + r.monto, 0);
  const totalPendientes = filtered.filter((r) => r.estado === "Pendiente" || r.estado === "Rechazado").length;

  function limpiarFiltros() {
    setDesde(""); setHasta(""); setCategoria("Todas"); setSubFiltro("Todas");
    setBuscarCbu(""); setBuscarCuit(""); setBuscarTxid(""); setBuscarTitular("");
  }

  const exportExcel = () => {
    const body = filtered.map((r) => ({
      TXID: r.txid,
      Fecha: r.fecha,
      Tipo: r.tipo === "ingreso" ? "Ingreso" : "Egreso",
      Categoria: r.categoria,
      Titular: r.titular,
      CBU_CVU: r.cbuCvu,
      Monto: r.monto,
      Estado: r.estado,
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
      body: [[formatARS(totalIngresos), formatARS(totalEgresos), formatARS(totalIngresos - totalEgresos), String(totalPendientes)]],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      startY: 52,
      head: [["TXID", "Fecha", "Tipo", "Categoria", "Titular", "Monto", "Estado"]],
      body: filtered.map((r) => [
        r.txid, r.fecha, r.tipo === "ingreso" ? "Ingreso" : "Egreso", r.categoria, r.titular, r.monto.toFixed(2), r.estado,
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
            <BtnOutline onClick={exportExcel}><FileSpreadsheet size={14} /> Excel</BtnOutline>
            <BtnPrimary onClick={exportPDF}><Download size={14} /> PDF</BtnPrimary>
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
            {([["principal", "Cuenta principal"], ["sub", "Por subcuenta"]] as const).map(([k, l]) => (
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
          {vista === "sub" && (
            sinSubcuentas ? (
              <span className="text-xs text-muted-foreground">Sin subcuentas asociadas</span>
            ) : (
              <select value={sub} onChange={(e) => setSub(e.target.value)} className="h-9 px-3 rounded-md border bg-card text-sm">
                {subcuentas.map((s) => <option key={s.nombre}>{s.nombre}</option>)}
              </select>
            )
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {vista === "principal" ? "Mostrando consolidado de cuenta madre" : (sinSubcuentas ? "Sin subcuentas asociadas" : `Filtrando movimientos de ${sub}`)}
          </span>
        </div>
      </Card>

      {/* KPIs resumen */}
      <div className="grid md:grid-cols-4 gap-5 mb-6">
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">Ingresos del periodo</div>
          <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-emerald-700">{formatARS(totalIngresos)}</div>
          <div className="text-xs text-muted-foreground mt-1">{filtered.filter((r) => r.tipo === "ingreso").length} movimientos</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">Egresos del periodo</div>
          <div className="text-xl md:text-2xl font-bold text-foreground">{formatARS(totalEgresos)}</div>
          <div className="text-xs text-muted-foreground mt-1">{filtered.filter((r) => r.tipo === "egreso").length} movimientos</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">Neto</div>
          <div className={`font-display tabular-nums text-xl md:text-2xl font-bold ${totalIngresos - totalEgresos >= 0 ? "text-emerald-700" : "text-danger-600"}`}>
            {totalIngresos - totalEgresos >= 0 ? "+ " : "- "}{formatARS(Math.abs(totalIngresos - totalEgresos))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">Pendientes / Rechazados</div>
          <div className="font-display tabular-nums text-xl md:text-2xl font-bold text-foreground">{totalPendientes}</div>
          <div className="text-xs text-muted-foreground mt-1">{filtered.filter((r) => r.estado === "Pendiente").length} pendientes, {filtered.filter((r) => r.estado === "Rechazado").length} rechazados</div>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4 mb-5">
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Fecha de inicio</label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Fecha de fin</label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} min={desde || undefined} />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Tipo de operacion</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="h-10 px-3 rounded-md border bg-card text-sm w-full sm:w-auto sm:min-w-[170px]">
              {CATEGORIAS.map(({ k, l }) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Subcuenta</label>
            {sinSubcuentas ? (
              <span className="inline-flex h-10 items-center text-xs text-muted-foreground">Sin subcuentas asociadas</span>
            ) : (
              <select value={subFiltro} onChange={(e) => setSubFiltro(e.target.value)} className="h-10 px-3 rounded-md border bg-card text-sm w-full sm:w-auto sm:min-w-[150px]">
                <option value="Todas">Todas</option>
                {subcuentas.map((s) => <option key={s.nombre}>{s.nombre}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="border-t pt-4 mb-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Busquedas especificas</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">CBU / CVU</label>
              <Input placeholder="Buscar por CBU/CVU..." value={buscarCbu} onChange={(e) => setBuscarCbu(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">CUIT</label>
              <Input placeholder="Buscar por CUIT..." value={buscarCuit} onChange={(e) => setBuscarCuit(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">TXID / N° Operacion</label>
              <Input placeholder="Buscar por TXID..." value={buscarTxid} onChange={(e) => setBuscarTxid(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Nombre del titular</label>
              <Input placeholder="Buscar por titular..." value={buscarTitular} onChange={(e) => setBuscarTitular(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center border-t pt-4">
          <div className="text-xs text-muted-foreground">
            {loading ? "Cargando..." : `${totalCount} movimientos`}
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
                <th className="text-left px-5 py-3 font-semibold">Movimiento</th>
                <th className="text-left px-5 py-3 font-semibold">TXID</th>
                <th className="text-left px-5 py-3 font-semibold">CBU / CVU</th>
                <th className="text-left px-5 py-3 font-semibold">Titular</th>
                <th className="text-left px-5 py-3 font-semibold">CUIT</th>
                <th className="text-left px-5 py-3 font-semibold">Fecha</th>
                <th className="text-right px-5 py-3 font-semibold">Comisión</th>
                <th className="text-right px-5 py-3 font-semibold">IVA</th>
                <th className="text-right px-5 py-3 font-semibold">Monto debitado</th>
                <th className="px-5 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-sm text-muted-foreground">
                    Sin datos registrados.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-sm text-muted-foreground">Cargando movimientos...</td>
                </tr>
              )}
              {paginated.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0 max-w-[220px]">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        r.tipo === "ingreso" ? "bg-emerald-50 text-emerald-600" : "bg-danger-50 text-danger-600"
                      }`}>
                        {r.tipo === "ingreso" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">
                          {r.tipo === "ingreso" ? "Recibiste dinero" : "Enviaste dinero"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{r.medio} · {r.categoria}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-xs font-mono text-muted-foreground">{r.txid}</div>
                  </td>
                  <td className="px-5 py-4 text-xs font-mono text-muted-foreground max-w-[140px] truncate">{r.cbuCvu}</td>
                  <td className="px-5 py-4 text-sm font-medium truncate max-w-[160px]">{r.titular}</td>
                  <td className="px-5 py-4 text-xs font-mono text-muted-foreground">{r.cuit}</td>
                  <td className="px-5 py-4 text-xs text-muted-foreground whitespace-nowrap">{r.fecha}</td>
                  <td className="px-5 py-4 text-xs font-mono text-muted-foreground">
                    {(r.categoria === "Transferencias" || r.categoria === "Egresos") ? formatARS(r.comision || 0) : "—"}
                  </td>
                  <td className="px-5 py-4 text-xs font-mono text-muted-foreground">
                    {(r.categoria === "Transferencias" || r.categoria === "Egresos") ? formatARS(r.impuesto || 0) : "—"}
                  </td>
                  <td className={`px-5 py-4 font-mono tabular-nums text-right font-semibold whitespace-nowrap text-sm ${r.tipo === "ingreso" ? "text-emerald-700" : ""}`}>
                    {r.tipo === "ingreso"
                      ? "+ " + formatARS(r.monto)
                      : (r.categoria === "Transferencias" || r.categoria === "Egresos")
                        ? "- " + formatARS((r.monto || 0) + (r.comision || 0) + (r.impuesto || 0))
                        : "- " + formatARS(r.monto || 0)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex gap-1.5 justify-end">
                      <button
                        title="Ver detalle"
                        onClick={() => setDetalle(r)}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg border bg-card hover:bg-accent hover:border-primary/40 transition"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        title="Descargar comprobante"
                        onClick={() => {
                          descargarComprobantePdf(comprobanteDeMov(r, { nombre: clienteNombre, cuit: clienteCuit, cbu: clienteCbu }));
                          toast.success("Comprobante descargado");
                        }}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg border bg-card hover:bg-accent hover:border-primary/40 transition"
                      >
                        <FileText size={14} />
                      </button>
                      <button
                        title="Compartir comprobante"
                        onClick={async () => {
                          const res = await compartirComprobante(comprobanteDeMov(r, { nombre: clienteNombre, cuit: clienteCuit, cbu: clienteCbu }));
                          if (res === "compartido") toast.success("Comprobante compartido");
                          else if (res === "descargado")
                            toast.info("Tu navegador no comparte archivos: se descargó el comprobante para adjuntarlo.");
                          else if (res === "error") toast.error("No se pudo compartir el comprobante");
                        }}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg border bg-card hover:bg-accent hover:border-primary/40 transition"
                      >
                        <Share2 size={14} />
                      </button>
                      <button
                        title="Ver mas"
                        onClick={() => setDetalle(r)}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg border bg-card hover:bg-accent hover:border-primary/40 transition"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t text-xs text-muted-foreground">
          <div>{totalCount === 0 ? "0 registros" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} de ${totalCount}`}</div>
          <div className="flex gap-2">
            <BtnOutline className="h-8 px-4 text-xs" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</BtnOutline>
            <BtnOutline className="h-8 px-4 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente</BtnOutline>
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
              <button onClick={() => setDetalle(null)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-accent transition">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4 pb-5 border-b">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                  detalle.tipo === "ingreso" ? "bg-emerald-50 text-emerald-600" : "bg-danger-50 text-danger-600"
                }`}>
                  {detalle.tipo === "ingreso" ? <ArrowDownLeft size={26} /> : <ArrowUpRight size={26} />}
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
                  <div className={`font-display tabular-nums text-2xl font-bold ${detalle.tipo === "ingreso" ? "text-emerald-700" : ""}`}>
                    {detalle.tipo === "ingreso"
                      ? "+ " + formatARS(detalle.monto)
                      : (detalle.categoria === "Transferencias" || detalle.categoria === "Egresos")
                        ? "- " + formatARS(detalle.monto + (detalle.comision || 0) + (detalle.impuesto || 0))
                        : "- " + formatARS(detalle.monto)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground mb-1">Estado</div>
                  <Badge tone={detalle.estado === "Acreditado" ? "success" : detalle.estado === "Pendiente" ? "warn" : "danger"}>
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
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Desde</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div><div className="text-xs text-muted-foreground">Nombre</div><div className="font-medium truncate">{detalle.senderName}</div></div>
                  <div><div className="text-xs text-muted-foreground">CUIT</div><div className="font-mono text-xs">{detalle.senderCuit}</div></div>
                  <div><div className="text-xs text-muted-foreground">CBU / CVU</div><div className="font-mono text-xs truncate">{detalle.senderCbu}</div></div>
                </div>
              </div>

              <div className="pb-5 border-b">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hacia</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
                  <div><div className="text-xs text-muted-foreground">Nombre</div><div className="font-medium truncate">{detalle.receiverName}</div></div>
                  <div><div className="text-xs text-muted-foreground">CUIT</div><div className="font-mono text-xs">{detalle.receiverCuit}</div></div>
                  <div><div className="text-xs text-muted-foreground">CBU / CVU</div><div className="font-mono text-xs truncate">{detalle.receiverCbu}</div></div>
                  <div><div className="text-xs text-muted-foreground">Banco</div><div className="font-medium truncate">{detalle.receiverBanco || "—"}</div></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm pb-2">
                <div><div className="text-xs text-muted-foreground">N° de operacion</div><div className="font-medium">{detalle.numeroOp}</div></div>
                <div><div className="text-xs text-muted-foreground">Referencia</div><div className="font-mono text-xs">{detalle.referencia}</div></div>
                <div><div className="text-xs text-muted-foreground">Canal de origen</div><div>{detalle.canal}</div></div>
                <div><div className="text-xs text-muted-foreground">Usuario</div><div>{detalle.usuario}</div></div>
                <div><div className="text-xs text-muted-foreground">Subcuenta</div><div>{detalle.subcuenta}</div></div>
                <div><div className="text-xs text-muted-foreground">Categoria</div><div>{detalle.categoria}</div></div>
                {(detalle.categoria === "Transferencias" || detalle.categoria === "Egresos") && (
                  <>
                    <div><div className="text-xs text-muted-foreground">Comisión</div><div className="font-mono">{formatARS(detalle.comision)}</div></div>
                    <div><div className="text-xs text-muted-foreground">IVA</div><div className="font-mono">{formatARS(detalle.impuesto)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Monto debitado</div><div className="font-mono font-semibold">{formatARS(detalle.monto + (detalle.comision || 0) + (detalle.impuesto || 0))}</div></div>
                  </>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <BtnPrimary
                  className="flex-1"
                  onClick={() => {
                    descargarComprobantePdf(comprobanteDeMov(detalle, { nombre: clienteNombre, cuit: clienteCuit, cbu: clienteCbu }));
                    toast.success("Comprobante descargado");
                  }}
                >
                  <Download size={15} /> Descargar comprobante
                </BtnPrimary>
                <BtnOutline
                  className="flex-1"
                  onClick={async () => {
                    const res = await compartirComprobante(comprobanteDeMov(detalle, { nombre: clienteNombre, cuit: clienteCuit, cbu: clienteCbu }));
                    if (res === "compartido") toast.success("Comprobante compartido");
                    else if (res === "descargado")
                      toast.info("Tu navegador no comparte archivos: se descargó el comprobante para adjuntarlo.");
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
              <BtnOutline className="h-8 px-4 text-xs" onClick={() => setPreview(false)}>Cerrar</BtnOutline>
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
                {vista === "principal" ? "Cuenta principal (consolidado)" : (sinSubcuentas ? "Sin subcuentas asociadas" : `Subcuenta: ${sub}`)}
                {categoria !== "Todas" && ` · Categoria: ${categoria}`}
              </div>
              <Card className="bg-muted/30 p-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div><div className="text-xs text-muted-foreground">Ingresos</div><div className="font-display tabular-nums font-semibold">{formatARS(totalIngresos)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Egresos</div><div className="font-display tabular-nums font-semibold">{formatARS(totalEgresos)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Neto</div><div className="font-display tabular-nums font-semibold text-emerald-700">{totalIngresos - totalEgresos >= 0 ? "+ " : "- "}{formatARS(Math.abs(totalIngresos - totalEgresos))}</div></div>
                </div>
              </Card>
              <div className="text-xs text-muted-foreground border-t pt-4">
                Documento firmado digitalmente por {brand.name} · Serie {serie}
              </div>
              <div className="flex gap-3 pt-2">
                <BtnOutline className="flex-1" onClick={() => { setPreview(false); exportExcel(); }}>
                  <FileSpreadsheet size={14} /> Excel (.xlsx)
                </BtnOutline>
                <BtnPrimary className="flex-1" onClick={() => { setPreview(false); exportPDF(); }}>
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