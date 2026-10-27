import type { MovimientoSubcuentaRow, SubcuentaConSaldos } from "@/lib/api/subcuentas";
import { formatMoney } from "@/shared/format";
import { TIPOS_EGRESO, TITULO_MOV } from "./estados";
import type { FiltroTipoMov, Mov, Sub } from "./types";

export const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export const mapSubs = (rows: SubcuentaConSaldos[]): Sub[] =>
  rows.map((r, i) => ({
    id: r.id,
    n: r.nombre,
    apellido: r.apellido ?? "",
    email: r.email ?? "",
    cbu: r.cbu ?? "",
    tipo: r.tipo as Sub["tipo"],
    e: r.estado as Sub["e"],
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

/**
 * Monto escrito a mano en formato es-AR: coma decimal y punto de miles
 * ("1,5" → 1.5, "1.234,56" → 1234.56, "1.500" → 1500). Sin coma, un punto que no
 * separa miles se toma como decimal ("1500.5" → 1500.5). NaN si no es un número.
 */
export function parseMontoAr(texto: string): number {
  const t = (texto ?? "").trim().replace(/\s/g, "").replace(/^\$/, "");
  if (!t) return NaN;
  let normal: string;
  if (t.includes(",")) {
    if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(t)) return NaN;
    normal = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    normal = t.replace(/\./g, "");
  } else {
    if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
    normal = t;
  }
  return Number(normal);
}

/** `limite` es texto libre: puede venir "50000", "50.000,00" o vacío. */
export const fmtLimite = (lim: string) => {
  const t = (lim ?? "").trim();
  if (!t) return "Sin límite";
  const n = parseMontoAr(t);
  if (Number.isNaN(n)) return t;
  return n > 0 ? formatMoney(n) : "Sin límite";
};

/** Recaudación es la subcuenta funcional (pool) del sistema; el resto se asigna a personas o áreas. */
export const esPool = (s: Pick<Sub, "tipo">) => s.tipo === "Recaudacion";

export function filtrarSubs(subs: Sub[], q: string, tipo: string, estado: string): Sub[] {
  return subs.filter(
    (s) =>
      (q === "" || s.n.toLowerCase().includes(q.toLowerCase()) || s.cbu.includes(q.trim())) &&
      (tipo === "Todos" || s.tipo === tipo) &&
      (estado === "Todos" || s.e === estado),
  );
}

export function totalesSubs(subs: Pick<Sub, "disp" | "ret">[]) {
  const disp = subs.reduce((a, s) => a + s.disp, 0);
  const ret = subs.reduce((a, s) => a + s.ret, 0);
  return { total: subs.reduce((a, s) => a + s.disp + s.ret, 0), disp, ret };
}

/** Porcentaje (con un decimal, como texto) del saldo de la subcuenta sobre el total. */
export function pctSaldo(s: Pick<Sub, "disp" | "ret">, total: number): string {
  return total > 0 ? (((s.disp + s.ret) / total) * 100).toFixed(1) : "0.0";
}

/** Texto "desde–hasta de total" del pie de la tabla paginada. */
export function rangoPagina(page: number, pageSize: number, total: number): string {
  return total === 0
    ? "0 registros"
    : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total}`;
}

/** CVU de 22 dígitos: 8 de entidad + 14 de cuenta (como los reales). */
export function generarCvu(random: () => number = Math.random): string {
  return "00000031" + Math.floor(10000000000000 + random() * 89999999999999);
}

export function mapMovimientos(rows: MovimientoSubcuentaRow[], entidad: string): Mov[] {
  return rows.map((m) => ({
    tipo: TIPOS_EGRESO.includes(m.tipo) ? "egreso" : "ingreso",
    titulo: TITULO_MOV[m.tipo] ?? m.tipo,
    txid: m.id_txn,
    cbu: m.cvu ?? "",
    entidad,
    fecha: (m.fecha ?? "").slice(0, 10),
    hora: (m.fecha ?? "").slice(11, 16),
    monto: Math.abs(Number(m.monto_operacion ?? 0)),
  }));
}

export function filtrarMovs(moves: Mov[], tipo: FiltroTipoMov, search: string): Mov[] {
  return moves.filter((m) => {
    if (tipo !== "todos" && m.tipo !== tipo) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !m.txid.toLowerCase().includes(q) &&
        !m.entidad.toLowerCase().includes(q) &&
        !m.cbu.includes(q)
      )
        return false;
    }
    return true;
  });
}

export function totalesMovs(moves: Mov[]) {
  return {
    depositos: moves.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + m.monto, 0),
    retiros: moves.filter((m) => m.tipo === "egreso").reduce((a, m) => a + m.monto, 0),
  };
}
