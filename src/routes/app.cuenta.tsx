import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/portal-shell";
import { DocPreviewModal } from "@/components/doc-preview";
import { CuentaSidebar } from "@/features/cuenta/components/CuentaSidebar";
import { CuentaStats } from "@/features/cuenta/components/CuentaStats";
import { DocumentosKycCard } from "@/features/cuenta/components/DocumentosKycCard";
import {
  InfoAdicionalCard,
  InfoEmpresaCard,
} from "@/features/cuenta/components/InfoAdicionalCards";
import { InfoUsuarioCard } from "@/features/cuenta/components/InfoUsuarioCard";
import { AltaCobreCard } from "@/features/cuenta/components/AltaCobreCard";
import { usePaisConModulos } from "@/shared/modulos-pais";
import { useCuentaPantalla } from "@/features/cuenta/hooks/useCuentaPantalla";
import type { DocReal } from "@/features/cuenta/types";

export const Route = createFileRoute("/app/cuenta")({ component: Page });

function Page() {
  const [docPreview, setDocPreview] = useState<DocReal | null>(null);
  const c = useCuentaPantalla();
  const pais = usePaisConModulos();

  return (
    <>
      <PageHeader
        title="Mi cuenta"
        description={
          c.isPJ
            ? "Datos del titular y documentacion societaria."
            : "Datos personales y documentacion KYC."
        }
      />

      <CuentaStats c={c} />

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <div className="space-y-6">
          <InfoUsuarioCard c={c} />
          <InfoAdicionalCard c={c} />
          {c.isPJ && <InfoEmpresaCard c={c} />}
          {pais.modulos.transferencias_cobre && <AltaCobreCard />}
          <DocumentosKycCard c={c} onPreview={setDocPreview} />
        </div>
        <CuentaSidebar c={c} />
      </div>

      <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
    </>
  );
}
