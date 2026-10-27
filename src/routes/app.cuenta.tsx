import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/portal-shell";
import { DocPreviewModal } from "@/components/doc-preview";
import { ConstanciaCbuModal } from "@/features/cuenta/components/ConstanciaCbuModal";
import { CuentaSidebar } from "@/features/cuenta/components/CuentaSidebar";
import { CuentaStats } from "@/features/cuenta/components/CuentaStats";
import { DocumentosKycCard } from "@/features/cuenta/components/DocumentosKycCard";
import {
  InfoAdicionalCard,
  InfoEmpresaCard,
} from "@/features/cuenta/components/InfoAdicionalCards";
import { InfoUsuarioCard } from "@/features/cuenta/components/InfoUsuarioCard";
import { useCuentaPantalla } from "@/features/cuenta/hooks/useCuentaPantalla";
import type { DocReal } from "@/features/cuenta/types";

export const Route = createFileRoute("/app/cuenta")({ component: Page });

function Page() {
  const [cbuPreview, setCbuPreview] = useState(false);
  const [docPreview, setDocPreview] = useState<DocReal | null>(null);
  const c = useCuentaPantalla();

  return (
    <>
      <PageHeader
        title="Mi cuenta"
        description={
          c.isPJ
            ? "Datos del titular, documentacion societaria, facturacion y plan."
            : "Datos personales, documentacion KYC, facturacion y plan."
        }
      />

      <CuentaStats c={c} />

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <div className="space-y-6">
          <InfoUsuarioCard c={c} />
          <InfoAdicionalCard c={c} />
          {c.isPJ && <InfoEmpresaCard c={c} />}
          <DocumentosKycCard c={c} onPreview={setDocPreview} />
        </div>
        <CuentaSidebar c={c} onConstancia={() => setCbuPreview(true)} />
      </div>

      {cbuPreview && <ConstanciaCbuModal c={c} onClose={() => setCbuPreview(false)} />}

      <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
    </>
  );
}
