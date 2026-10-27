import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { BtnOutline, Card } from "@/components/portal-shell";
import { LOG_ACTIVIDAD } from "../estados";

export function RegistroActividadCard() {
  return (
    <Card>
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <AlertTriangle size={16} /> Registro de actividad
      </h3>
      <div className="divide-y">
        {LOG_ACTIVIDAD.map((l, i) => (
          <div key={i} className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2.5">
              {l.ok ? (
                <CheckCircle2 size={14} className="text-emerald-600" />
              ) : (
                <AlertTriangle size={14} className="text-danger-600" />
              )}
              <div className="text-sm">{l.d}</div>
            </div>
            <div className="text-xs text-muted-foreground">
              {l.ip} · {l.f}
            </div>
          </div>
        ))}
      </div>
      <BtnOutline className="mt-4">Ver historial completo</BtnOutline>
    </Card>
  );
}
