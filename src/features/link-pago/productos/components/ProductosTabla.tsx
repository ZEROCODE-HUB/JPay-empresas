import { Plus, Search } from "lucide-react";
import { BtnOutline, BtnPrimary, Card, Input } from "@/components/portal-shell";
import { formatMoney } from "@/shared/format";
import type { CatalogoProductos } from "../hooks/useCatalogoProductos";

/** Barra de acciones y tabla de productos con selección. */
export function ProductosTabla({
  catalogo,
  onGenerarLink,
}: {
  catalogo: CatalogoProductos;
  onGenerarLink: () => void;
}) {
  const { products, selected } = catalogo;
  return (
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
          <BtnOutline className="h-10" onClick={catalogo.abrirNuevo}>
            <Plus size={15} /> Producto
          </BtnOutline>
          <BtnPrimary className="h-10" onClick={onGenerarLink}>
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
                    onChange={(e) => catalogo.toggleTodos(e.target.checked)}
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
                      onChange={() => catalogo.toggleSelected(p.id)}
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
                        onClick={() => catalogo.abrirEditar(p)}
                      >
                        Editar
                      </BtnOutline>
                      <BtnOutline
                        className="h-7 px-2 text-[11px]"
                        onClick={() => catalogo.setConfirmarEliminarId(p.id)}
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
    </>
  );
}
