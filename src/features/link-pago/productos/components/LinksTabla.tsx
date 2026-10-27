import { Copy, Edit3, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, BtnOutline, Card } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import { toneEstadoLink } from "../estados";
import type { ListaLinks } from "../hooks/useListaLinks";
import {
  codigoLink,
  linkDisplayStatus,
  LINKS_PAGE_SIZE,
  montoProductos,
  paginarLinks,
} from "../utils";

const BTN_ICONO =
  "h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-muted transition";

/** Tabla paginada de los links de pago generados. */
export function LinksTabla({ lista }: { lista: ListaLinks }) {
  const { items, page, totalPages, total } = paginarLinks(lista.links, lista.page, LINKS_PAGE_SIZE);
  const btnPag = "h-7 px-2 text-[11px]";

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm">Links de pago generados</h3>
        <span className="text-xs text-muted-foreground">
          {total} link{total !== 1 ? "s" : ""}
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
            {total === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  Aun no generaste links de pago. Crealos desde la pestana Productos.
                </td>
              </tr>
            ) : (
              items.map((l) => {
                const desc = l.products.map((p) => p.name).join(", ") || l.reference || "-";
                const estado = linkDisplayStatus(l);
                return (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-5 py-3 font-mono text-xs">{codigoLink(l)}</td>
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
                      <Badge tone={toneEstadoLink(estado)}>{estado}</Badge>
                    </td>
                    <td className="px-5 py-3 font-mono tabular-nums text-right text-xs font-semibold">
                      {formatMoney(montoProductos(l.products), { decimals: 0 })}
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
                          onClick={() => lista.setDetailLink(l)}
                          className={BTN_ICONO}
                          title="Ver detalle"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => lista.setEditLink(l)}
                          className={BTN_ICONO}
                          title="Editar"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => lista.setConfirmarEliminarId(l.id)}
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
      {total > 0 && (
        <div className="px-5 py-3 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Mostrando {(page - 1) * LINKS_PAGE_SIZE + 1}–{Math.min(page * LINKS_PAGE_SIZE, total)}{" "}
            de {total}
          </span>
          <div className="flex gap-1">
            <BtnOutline className={btnPag} disabled={page <= 1} onClick={() => lista.setPage(1)}>
              «
            </BtnOutline>
            <BtnOutline
              className={btnPag}
              disabled={page <= 1}
              onClick={() => lista.setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </BtnOutline>
            <span className="h-7 px-2 flex items-center font-medium">
              {page}/{totalPages}
            </span>
            <BtnOutline
              className={btnPag}
              disabled={page >= totalPages}
              onClick={() => lista.setPage((p) => Math.min(totalPages, p + 1))}
            >
              ›
            </BtnOutline>
            <BtnOutline
              className={btnPag}
              disabled={page >= totalPages}
              onClick={() => lista.setPage(totalPages)}
            >
              »
            </BtnOutline>
          </div>
        </div>
      )}
    </Card>
  );
}
