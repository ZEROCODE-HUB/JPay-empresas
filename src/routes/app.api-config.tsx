import { createFileRoute } from "@tanstack/react-router";
import { brand, pageTitle } from "@/brand/brand";
import { useState } from "react";
import { ExternalLink, BookOpen, X } from "lucide-react";
import { Card, BtnPrimary, BtnOutline, PageHeader } from "@/components/portal-shell";
import { CapacidadesCard } from "@/features/link-pago/e-commerce/components/CapacidadesCard";
import { ClaveIntegracionModal } from "@/features/link-pago/e-commerce/components/ClaveIntegracionModal";
import { IntegracionesTabla } from "@/features/link-pago/e-commerce/components/IntegracionesTabla";
import { useIntegracionesEcom } from "@/features/link-pago/e-commerce/hooks/useIntegracionesEcom";

export const Route = createFileRoute("/app/api-config")({
  head: () => ({
    meta: [{ title: pageTitle("APIs y e-commerce") }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});

function Page() {
  const [modalOpen, setModalOpen] = useState(false);
  const ecom = useIntegracionesEcom();

  return (
    <>
      <PageHeader
        title="APIs y e-commerce"
        description="Integra tus sistemas con las APIs de la plataforma y conecta tu tienda en línea para cobrar con links de pago."
      />

      {/* Action card */}
      <Card className="max-w-xl mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="flex-1">
            <h2 className="text-sm font-semibold">Módulo de APIs externas</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Este módulo te permite integrar tus sistemas con las APIs externas de {brand.name}.
              Todavía no está habilitado para tu cuenta.
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 px-4 text-sm font-semibold rounded-md border bg-card hover:bg-muted transition whitespace-nowrap"
            >
              <BookOpen size={14} /> Ver documentación
            </a>
            <BtnPrimary onClick={() => setModalOpen(true)}>
              <ExternalLink size={14} /> Solicitar habilitación
            </BtnPrimary>
          </div>
        </div>
      </Card>

      {/* Modal de solicitud */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModalOpen(false)} />
          <div
            className="relative bg-card rounded-lg max-w-md w-full p-6 shadow-xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
            <div className="mb-4 mt-2">
              <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center">
                <ExternalLink size={24} className="text-muted-foreground" />
              </div>
            </div>
            <h3 className="text-base font-semibold mb-2">
              El módulo de APIs externas no está habilitado para tu cuenta.
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              ¿Quieres solicitar su habilitación?
            </p>
            <div className="flex gap-3 justify-center">
              <BtnOutline onClick={() => setModalOpen(false)}>Cancelar</BtnOutline>
              <BtnPrimary
                onClick={() => {
                  window.open(
                    `${window.location.origin}/api-configuration`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                  setModalOpen(false);
                }}
              >
                Solicitar habilitación
              </BtnPrimary>
            </div>
          </div>
        </div>
      )}

      <CapacidadesCard />
      <IntegracionesTabla s={ecom} />
      <ClaveIntegracionModal s={ecom} />
    </>
  );
}
