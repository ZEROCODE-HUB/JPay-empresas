import { CheckCircle2, Eye, FileText } from "lucide-react";
import { BtnOutline, Card } from "@/components/portal-shell";
import { formatDate } from "@/shared/format";
import type { CuentaPantalla } from "../hooks/useCuentaPantalla";
import type { DocReal } from "../types";

export function DocumentosKycCard({
  c,
  onPreview,
}: {
  c: CuentaPantalla;
  onPreview: (d: DocReal) => void;
}) {
  return (
    <Card>
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <FileText size={16} /> Documentacion {c.isPJ ? "KYC / KYB" : "KYC"}
      </h3>
      {c.loadingDocs ? (
        <p className="text-sm text-muted-foreground">Cargando documentos…</p>
      ) : c.kycDocs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aun no cargaste documentos en tu onboarding.
        </p>
      ) : (
        <div className="divide-y">
          {c.kycDocs.map((d) => (
            <div key={d.rawTipo + d.label} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <div>
                  <div className="text-sm font-semibold">{d.tipo}</div>
                  <div className="text-xs text-muted-foreground">
                    Subido el {formatDate(d.date)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <BtnOutline className="h-9 px-2.5 text-xs" onClick={() => onPreview(d)}>
                  <Eye size={13} />
                </BtnOutline>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
