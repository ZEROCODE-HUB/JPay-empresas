import { Download } from "lucide-react";
import { toast } from "sonner";
import { brand } from "@/brand/brand";
import { BrandLogo } from "@/components/brand-logo";
import { BtnOutline, BtnPrimary, Card } from "@/components/portal-shell";
import { formatDateTime } from "@/shared/format";
import type { CuentaPantalla } from "../hooks/useCuentaPantalla";

/** Vista previa de la constancia de CBU (la descarga todavía es simulada). */
export function ConstanciaCbuModal({ c, onClose }: { c: CuentaPantalla; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-card border-b px-6 py-4 flex justify-between items-center z-10">
          <div className="font-semibold">Vista previa &mdash; Constancia de CBU</div>
          <BtnOutline className="h-8 px-3 text-xs" onClick={onClose}>
            Cerrar
          </BtnOutline>
        </div>
        <div className="p-8 space-y-5">
          <div className="flex items-center justify-between border-b pb-4">
            <BrandLogo />
            <div className="text-right text-xs text-muted-foreground">
              <div className="font-mono font-semibold text-foreground">CBU-EMP-2026-000042</div>
              <div>Generado: {formatDateTime(new Date())}</div>
            </div>
          </div>
          <h2 className="text-xl font-semibold">Constancia de CBU</h2>
          <p className="text-xs text-muted-foreground">
            {brand.company.legalName} certifica que la siguiente cuenta esta activa:
          </p>
          <Card className="bg-muted/30">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{c.isPJ ? "Razon social" : "Titular"}</span>
                <span className="font-semibold text-right">
                  {c.isPJ ? c.empresaInfo.nombreLegal : `${c.userNombre} ${c.userApellido}`}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{c.isPJ ? "CUIT" : "CUIL"}</span>
                <span className="font-mono font-semibold">{c.dp.cuitCuil}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">CVU</span>
                <span className="font-mono font-semibold text-right break-all">{c.cbu.cbu}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Alias</span>
                <span className="font-mono font-semibold">{c.cbu.alias}</span>
              </div>
            </div>
          </Card>
          <div className="text-[11px] text-muted-foreground border-t pt-3">
            Documento firmado digitalmente por {brand.company.legalName}. Valido como constancia
            oficial de cuenta.
          </div>
          <div className="flex gap-2 pt-1">
            <BtnOutline className="flex-1" onClick={onClose}>
              Cancelar
            </BtnOutline>
            <BtnPrimary
              className="flex-1"
              onClick={() => {
                onClose();
                toast.success("Constancia de CBU descargada");
              }}
            >
              <Download size={14} /> Descargar PDF
            </BtnPrimary>
          </div>
        </div>
      </div>
    </div>
  );
}
