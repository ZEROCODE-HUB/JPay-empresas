import { Copy, ExternalLink } from "lucide-react";
import { medioPagoLabels, type MedioPago, type RegistroDeLote } from "@/lib/api/cobros-masivos";
import { toResolvableLinkPagoUrl } from "@/lib/pay-url";
import { formatMoney } from "@/shared/format";
import { REGISTRO_ESTADO_BADGE } from "../estados";

const COLUMNAS: { label: string; align: "left" | "right" }[] = [
  { label: "Descripcion", align: "left" },
  { label: "Monto", align: "right" },
  { label: "Pagado", align: "right" },
  { label: "Entidad", align: "left" },
  { label: "Usuario", align: "left" },
  { label: "Vencimientos", align: "left" },
  { label: "Medios", align: "left" },
  { label: "Estado", align: "left" },
  { label: "Link", align: "left" },
];

/**
 * Clase del monto pagado. En el detalle del lote ("pagina") el monto en 0 no va en negrita
 * y el ID del registro va en monoespaciada; en el modal de gestión, al revés.
 */
function pagadoClass(r: RegistroDeLote, variante: "modal" | "pagina") {
  const color =
    r.montoPagado >= r.monto
      ? "text-emerald-600"
      : r.montoPagado > 0
        ? "text-amber-600"
        : "text-muted-foreground";
  const negrita = variante === "modal" || r.montoPagado > 0;
  return `${color} font-mono tabular-nums${negrita ? " font-semibold" : ""}`;
}

/** Tabla de registros de un lote (descripción, montos, entidad, vencimientos, link). */
export function RegistrosTabla({
  registros,
  hayRegistros,
  mediosLote,
  onCopiarLink,
  variante,
}: {
  /** Filas a mostrar (ya paginadas si corresponde). */
  registros: RegistroDeLote[];
  /** Si el lote tiene registros (para el mensaje de vacío). */
  hayRegistros: boolean;
  mediosLote: MedioPago[];
  onCopiarLink: (url: string) => void;
  variante: "modal" | "pagina";
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {COLUMNAS.map((c) => (
              <th
                key={c.label}
                className={`${c.align === "right" ? "text-right" : "text-left"} px-3 py-3 font-semibold text-xs uppercase`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {registros.map((r) => (
            <tr key={r.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-3 py-3 max-w-[180px]">
                <div className="font-semibold truncate" title={r.descripcion}>
                  {r.descripcion}
                </div>
                <div
                  className={`text-[10px] text-muted-foreground${variante === "pagina" ? " font-mono" : ""}`}
                >
                  {r.id}
                </div>
              </td>
              <td className="px-3 py-3 font-mono tabular-nums text-right font-semibold whitespace-nowrap">
                {formatMoney(r.monto)}
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <span className={pagadoClass(r, variante)}>{formatMoney(r.montoPagado)}</span>
              </td>
              <td
                className="px-3 py-3 text-xs"
                title={`${r.tipoEntidad} ${r.idEntidad} - ${r.subEntidad}`}
              >
                <div className="font-medium">
                  {r.tipoEntidad} {r.idEntidad}
                </div>
                <div className="text-muted-foreground">{r.subEntidad}</div>
              </td>
              <td className="px-3 py-3 text-xs">
                <div className="font-medium">{r.identificacionUsuario}</div>
                {r.email && (
                  <div className="text-muted-foreground truncate max-w-[120px]" title={r.email}>
                    {r.email}
                  </div>
                )}
              </td>
              <td className="px-3 py-3 text-[11px] whitespace-nowrap">
                <div>1º: {r.fechaVencimiento1?.slice(0, 10) ?? "-"}</div>
                {r.fechaVencimiento2 && <div>2º: {r.fechaVencimiento2.slice(0, 10)}</div>}
                {r.fechaVencimiento3 && <div>3º: {r.fechaVencimiento3.slice(0, 10)}</div>}
              </td>
              <td className="px-3 py-3 text-[11px]">
                {(r.mediosPago ?? mediosLote).map((m) => (
                  <span key={m} className="inline-block px-1.5 py-0.5 rounded bg-muted mr-1 mb-0.5">
                    {medioPagoLabels[m as keyof typeof medioPagoLabels]}
                  </span>
                ))}
              </td>
              <td className="px-3 py-3">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    REGISTRO_ESTADO_BADGE[r.estado]?.style ?? ""
                  }`}
                >
                  {REGISTRO_ESTADO_BADGE[r.estado]?.label ?? r.estado}
                </span>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {r.fechaPago && `Pagado: ${r.fechaPago.slice(0, 10)}`}
                </div>
              </td>
              <td className="px-3 py-3">
                {r.linkDePago ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onCopiarLink(r.linkDePago!)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted transition"
                      title="Copiar link"
                    >
                      <Copy size={13} className="text-muted-foreground" />
                    </button>
                    <a
                      href={toResolvableLinkPagoUrl(r.linkDePago)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted transition"
                      title="Abrir link"
                    >
                      <ExternalLink size={13} className="text-muted-foreground" />
                    </a>
                  </div>
                ) : (
                  <span className="text-[11px] text-muted-foreground">-</span>
                )}
                {r.emailEnviado && (
                  <div className="text-[10px] text-emerald-600 mt-0.5">Email enviado</div>
                )}
              </td>
            </tr>
          ))}
          {!hayRegistros && (
            <tr>
              <td colSpan={9} className="px-5 py-8 text-center text-sm text-muted-foreground">
                No hay registros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
