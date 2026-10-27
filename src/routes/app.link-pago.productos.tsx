import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/portal-shell";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { useClienteActual } from "@/hooks/useLinksPago";
import { GenerarLinkDialog } from "@/features/link-pago/productos/components/GenerarLinkDialog";
import { LinkDetailDialog } from "@/features/link-pago/productos/components/LinkDetailDialog";
import { LinkEditDialog } from "@/features/link-pago/productos/components/LinkEditDialog";
import { LinksTabla } from "@/features/link-pago/productos/components/LinksTabla";
import { ProductFormDialog } from "@/features/link-pago/productos/components/ProductFormDialog";
import { ProductosTabla } from "@/features/link-pago/productos/components/ProductosTabla";
import { useCatalogoProductos } from "@/features/link-pago/productos/hooks/useCatalogoProductos";
import { useGenerarLink } from "@/features/link-pago/productos/hooks/useGenerarLink";
import { useListaLinks } from "@/features/link-pago/productos/hooks/useListaLinks";

export const Route = createFileRoute("/app/link-pago/productos")({ component: Page });

const TABS = [
  ["productos", "Productos"],
  ["links", "Links de pago"],
] as const;

function Page() {
  const { data: cliente } = useClienteActual();
  const catalogo = useCatalogoProductos(cliente?.legajo);
  const lista = useListaLinks(cliente?.legajo);
  const [tab, setTab] = useState<"productos" | "links">("productos");
  const generar = useGenerarLink({
    cliente,
    products: catalogo.products,
    selected: catalogo.selected,
    onCreado: (link) => {
      lista.mostrarRecienCreado(link);
      setTab("links");
      catalogo.setSelected([]);
    },
    onRefrescar: lista.refrescar,
  });
  const { detailLink, confirmarEliminarId: eliminarLinkId } = lista;

  return (
    <>
      <PageHeader
        title="Productos"
        description="Crea productos y genera links de cobro para compartir con tus clientes."
      />

      <div className="flex gap-6 border-b border-black-100 mb-6">
        {TABS.map(([k, l]) => (
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
          <ProductosTabla catalogo={catalogo} onGenerarLink={generar.abrir} />

          <ProductFormDialog
            key={catalogo.editing?.id ?? "nuevo"}
            open={catalogo.showForm}
            onClose={catalogo.cerrarForm}
            product={catalogo.editing}
            onSave={catalogo.saveProduct}
          />

          <GenerarLinkDialog
            form={generar}
            products={catalogo.products}
            selected={catalogo.selected}
          />

          <ConfirmDialog
            confirmLabel="Eliminar"
            variant="danger"
            closeOnConfirm
            open={catalogo.confirmarEliminarId !== null}
            title="¿Eliminar producto?"
            message="Esta accion no se puede deshacer."
            onClose={() => catalogo.setConfirmarEliminarId(null)}
            onConfirm={() => {
              if (catalogo.confirmarEliminarId)
                catalogo.deleteProduct(catalogo.confirmarEliminarId);
            }}
          />
        </>
      )}

      {tab === "links" && <LinksTabla lista={lista} />}

      {detailLink && (
        <LinkDetailDialog
          link={detailLink}
          banderas={lista.detailLinkBanderas}
          onClose={() => lista.setDetailLink(null)}
          onEditar={() => {
            lista.setEditLink(detailLink);
            lista.setDetailLink(null);
          }}
        />
      )}

      <ConfirmDialog
        confirmLabel="Eliminar"
        variant="danger"
        closeOnConfirm
        open={eliminarLinkId !== null}
        title="¿Eliminar link de pago?"
        message="El enlace dejara de funcionar y no se podra recuperar. Esta accion no se puede deshacer."
        onClose={() => lista.setConfirmarEliminarId(null)}
        onConfirm={() => {
          if (eliminarLinkId) lista.deleteLink(eliminarLinkId);
          lista.setConfirmarEliminarId(null);
        }}
      />

      <LinkEditDialog
        link={lista.editLink}
        onClose={() => lista.setEditLink(null)}
        onSave={lista.saveEditLink}
      />
    </>
  );
}
