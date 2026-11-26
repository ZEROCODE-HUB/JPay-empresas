// Edge Function: estados de cuenta mensuales de los Cobre Balances (Solution Design §7, «Informes
// vía API»: `POST /reports` con `resource: accounts` y `layout: cobre_balance_statements_v1`, luego
// `GET /reports` hasta que exista y `POST /reports_download_links`, link de 30 minutos).
// Body: { accion, legajo? }. El cliente ve los suyos; un administrador (o la service role), los
// de cualquier cliente pasando `legajo`.
//
// - `listar`: sus cuentas (Balance en pesos y, en cuenta propia, Global y USA) y los meses que se
//   pueden pedir (desde que existe la cuenta hasta el mes anterior; el mes en curso no cerró).
// - `descargar` { cuenta, periodo: 'YYYY-MM' }: pide el reporte la primera vez (Cobre devuelve el
//   mismo si se repite) y, si ya está generado, baja el archivo y responde el PDF en base64. Si
//   todavía se está generando responde `{ estado: 'generando' }` para reintentar en unos segundos.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { unzipSync } from "npm:fflate@0.8.2";
import { CobreError } from "../_shared/cobre.ts";
import { conexionCobre, instanciaCobre, type ConexionCobre } from "../_shared/cobre-servidor.ts";
import {
  esAdmin,
  esServiceRole,
  handler,
  HttpError,
  json,
  readJson,
  serviceClient,
  userClient,
} from "../_shared/http.ts";
import { brand } from "../_shared/brand.ts";

type Obj = Record<string, unknown>;
type Cuenta = {
  tipo: string;
  cuenta_externa_id: string;
  clabe: string | null;
  moneda: string | null;
  estado: string;
  instancia_id: string | null;
  created_at: string;
};

const LAYOUT = "cobre_balance_statements_v1";
const MESES = 12;

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Obj>(req);
    const sb = serviceClient();
    const admin = esServiceRole(req) || (await esAdmin(req));
    let legajo: string;
    if (admin) {
      legajo = typeof body.legajo === "string" ? body.legajo.trim() : "";
      if (!legajo) throw new HttpError(400, "Falta el cliente");
    } else {
      const { data, error } = await userClient(req).rpc("current_cliente_legajo");
      if (error || typeof data !== "string" || !data)
        throw new HttpError(403, "Cliente no encontrado");
      legajo = data;
    }
    try {
      switch (body.accion) {
        case "listar":
          return json(await listar(sb, legajo));
        case "descargar":
          return json(await descargar(sb, legajo, String(body.cuenta ?? ""), body.periodo));
        default:
          throw new HttpError(400, "Acción inválida");
      }
    } catch (e) {
      if (e instanceof CobreError) {
        throw new HttpError(
          e.status >= 400 && e.status < 500 ? 422 : 502,
          `No se pudo obtener el estado de cuenta: ${e.message}`,
        );
      }
      throw e;
    }
  }),
);

/** Mes (YYYY-MM) en la hora de México (UTC−6). */
function mesMx(d: Date): string {
  const mx = new Date(d.getTime() - 6 * 3_600_000);
  return `${mx.getUTCFullYear()}-${String(mx.getUTCMonth() + 1).padStart(2, "0")}`;
}

function mesAnterior(p: string): string {
  const [a, m] = p.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/** Cuentas Cobre del cliente: su Balance en pesos y, en cuenta propia, sus Balances USD. */
async function cuentasDe(sb: SupabaseClient, legajo: string): Promise<Cuenta[]> {
  const { data: inst } = await sb
    .from("cobre_instancias")
    .select("id")
    .eq("cliente_legajo", legajo);
  const instancias = ((inst ?? []) as { id: string }[]).map((i) => i.id);
  const sel = "tipo, cuenta_externa_id, clabe, moneda, estado, instancia_id, created_at";
  const [{ data: propias }, { data: usd }] = await Promise.all([
    sb.from("cobre_cuentas").select(sel).eq("tipo", "cliente").eq("cliente_legajo", legajo),
    instancias.length
      ? sb
          .from("cobre_cuentas")
          .select(sel)
          .in("tipo", ["global", "usa"])
          .in("instancia_id", instancias)
      : Promise.resolve({ data: [] }),
  ]);
  return [...((propias ?? []) as Cuenta[]), ...((usd ?? []) as Cuenta[])].sort((a, b) =>
    a.created_at < b.created_at ? -1 : 1,
  );
}

function periodosDe(c: Cuenta): string[] {
  const hasta = mesAnterior(mesMx(new Date()));
  const desde = mesMx(new Date(c.created_at));
  const out: string[] = [];
  for (let p = hasta; p >= desde && out.length < MESES; p = mesAnterior(p)) out.push(p);
  return out;
}

const NOMBRE: Record<string, string> = {
  cliente: "Cuenta en pesos",
  global: "Balance Global (dólares)",
  usa: "Balance USA (dólares)",
};

async function listar(sb: SupabaseClient, legajo: string) {
  const cuentas = await cuentasDe(sb, legajo);
  const { data: pedidos } = await sb
    .from("cobre_estados_cuenta")
    .select("cuenta_externa_id, periodo, estado, motivo, updated_at")
    .eq("cliente_legajo", legajo);
  return {
    cuentas: cuentas.map((c) => ({
      cuenta: c.cuenta_externa_id,
      nombre: NOMBRE[c.tipo] ?? c.tipo,
      clabe: c.clabe,
      moneda: c.moneda ?? "MXN",
      activa: c.estado === "activa",
      periodos: periodosDe(c),
    })),
    pedidos: pedidos ?? [],
  };
}

async function conexionDe(sb: SupabaseClient, c: Cuenta): Promise<ConexionCobre> {
  if (!c.instancia_id) return conexionCobre(sb);
  const inst = await instanciaCobre(sb, c.instancia_id);
  if (!inst) throw new HttpError(409, "La cuenta de Cobre de este cliente ya no está conectada");
  return conexionCobre(sb, inst);
}

async function descargar(sb: SupabaseClient, legajo: string, cuentaId: string, periodo: unknown) {
  if (typeof periodo !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    throw new HttpError(400, "Mes inválido");
  }
  const c = (await cuentasDe(sb, legajo)).find((x) => x.cuenta_externa_id === cuentaId);
  if (!c) throw new HttpError(404, "Cuenta inexistente");
  if (!periodosDe(c).includes(periodo)) {
    throw new HttpError(409, "Ese mes todavía no cerró o es anterior a la cuenta");
  }
  const conexion = await conexionDe(sb, c);
  const modo = conexion.modo;

  const { data: previa } = await sb
    .from("cobre_estados_cuenta")
    .select("id, reporte_id")
    .eq("modo", modo)
    .eq("cuenta_externa_id", cuentaId)
    .eq("periodo", periodo)
    .maybeSingle();
  let fila = previa as { id: string; reporte_id: string | null } | null;
  if (!fila) {
    const { data, error } = await sb
      .from("cobre_estados_cuenta")
      .upsert(
        {
          modo,
          cuenta_externa_id: cuentaId,
          cliente_legajo: legajo,
          instancia_id: c.instancia_id,
          periodo,
        },
        { onConflict: "modo,cuenta_externa_id,periodo" },
      )
      .select("id, reporte_id")
      .single();
    if (error) throw new HttpError(500, error.message);
    fila = data;
  }
  const marcar = (patch: Obj) =>
    sb
      .from("cobre_estados_cuenta")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", fila!.id);

  const nombre = `estado-de-cuenta-${periodo}-${cuentaId}.pdf`;
  if (modo === "simulado") {
    await marcar({ estado: "listo", reporte_id: fila.reporte_id ?? `repo_sim_${periodo}` });
    return { estado: "listo", nombre, pdf: encodeBase64(pdfSimulado(cuentaId, periodo)) };
  }

  // 1) El reporte (Cobre devuelve el mismo para la misma cuenta y mes).
  let reporteId = fila.reporte_id;
  if (!reporteId) {
    let r: Obj;
    try {
      r = await conexion.cliente.post<Obj>("/reports", {
        resource: "accounts",
        layout: LAYOUT,
        metadata: { account_id: cuentaId, statement_date: periodo },
      });
    } catch (e) {
      if (e instanceof CobreError) await marcar({ estado: "error", motivo: e.message });
      throw e;
    }
    reporteId = typeof r.id === "string" && r.id ? r.id : null;
    if (!reporteId) throw new HttpError(502, "Cobre no devolvió el reporte");
    await marcar({ reporte_id: reporteId, estado: "solicitado", motivo: null });
  }

  // 2) ¿Ya está generado? Cobre no publica un estado: se toma `created_at` del listado.
  const [a, m] = periodo.split("-").map(Number);
  const inicio = Date.UTC(a, m - 1, 1);
  const lista = await conexion.cliente.get<{ contents?: Obj[] }>("/reports", {
    report_start_date_gte: new Date(inicio - 3 * 86_400_000).toISOString().slice(0, 19) + "Z",
    report_start_date_lte: new Date(inicio + 3 * 86_400_000).toISOString().slice(0, 19) + "Z",
  });
  const rep = (lista?.contents ?? []).find((x) => x.id === reporteId);
  if (!rep || !rep.created_at) return { estado: "generando" };

  // 3) Link de descarga (30 min) y el archivo: un ZIP con el PDF (o el PDF directo).
  let link: { download_url?: string };
  try {
    link = await conexion.cliente.post<{ download_url?: string }>("/reports_download_links", {
      report_ids: [reporteId],
    });
  } catch (e) {
    // REP002: Cobre todavía no tiene el archivo de ese reporte.
    if (e instanceof CobreError && e.codigo === "REP002") return { estado: "generando" };
    throw e;
  }
  if (!link?.download_url) return { estado: "generando" };
  const res = await fetch(link.download_url);
  if (!res.ok) throw new HttpError(502, `No se pudo bajar el archivo de Cobre (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const pdf = extraerPdf(bytes);
  if (!pdf) throw new HttpError(502, "El archivo de Cobre no trae el PDF del estado de cuenta");
  await marcar({ estado: "listo", motivo: null });
  return { estado: "listo", nombre, pdf: encodeBase64(pdf) };
}

function extraerPdf(bytes: Uint8Array): Uint8Array | null {
  const es = (b: Uint8Array, s: string) => s.split("").every((ch, i) => b[i] === ch.charCodeAt(0));
  if (es(bytes, "%PDF")) return bytes;
  if (!es(bytes, "PK")) return null;
  const archivos = unzipSync(bytes);
  const pdf = Object.entries(archivos).find(
    ([n, b]) => n.toLowerCase().endsWith(".pdf") || es(b, "%PDF"),
  );
  return pdf ? pdf[1] : null;
}

/** PDF mínimo para el modo simulado (no hay Cobre real del que bajarlo). */
function pdfSimulado(cuenta: string, periodo: string): Uint8Array {
  const texto = `Estado de cuenta simulado ${periodo} - ${cuenta} - ${brand.name}`.replace(
    /[()\\]/g,
    "",
  );
  const contenido = `BT /F1 14 Tf 60 760 Td (${texto}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offs) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}
