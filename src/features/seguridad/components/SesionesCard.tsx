import { Monitor, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, BtnOutline, Card, Input } from "@/components/portal-shell";
import { OPCIONES_TIEMPO_SESION } from "../estados";
import type { useSesiones } from "../hooks/useSesiones";
import { tiempoCustomValido } from "../utils";

const claseOpcion = (activa: boolean) =>
  activa
    ? "border-primary bg-[color:var(--brand-primary-50)] text-primary-ink"
    : "border-border hover:border-primary/50 bg-card text-muted-foreground";

function TiempoSesion({ s }: { s: ReturnType<typeof useSesiones> }) {
  return (
    <div className="mb-5 pb-5 border-b">
      <div className="text-xs text-muted-foreground mb-2">
        Tiempo de sesion activa: la sesion se cerrara automaticamente despues del periodo de
        inactividad.
      </div>
      <div className="flex flex-wrap gap-1.5">
        {OPCIONES_TIEMPO_SESION.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => {
              s.setSesionTiempo(opt === "Nunca" ? "" : opt);
              s.setCustomTiempo("");
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition ${claseOpcion(
              s.sesionTiempo === opt,
            )}`}
          >
            {opt}
          </button>
        ))}
        <button
          type="button"
          onClick={() => s.setSesionTiempo("custom")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition flex items-center gap-1 ${claseOpcion(
            s.sesionTiempo === "custom",
          )}`}
        >
          Custom
        </button>
      </div>
      {s.sesionTiempo === "custom" && (
        <div className="flex items-center gap-2 mt-2">
          <Input
            value={s.customTiempo}
            onChange={(e) => s.setCustomTiempo(e.target.value)}
            placeholder="Minutos"
            className="h-9 w-28 text-sm"
            type="number"
            min={1}
          />
          <span className="text-xs text-muted-foreground">minutos</span>
          <BtnOutline
            className="h-9 px-3 text-xs"
            onClick={() => {
              if (!tiempoCustomValido(s.customTiempo)) {
                toast.error("Ingresa un tiempo valido");
                return;
              }
              toast.success(`Tiempo de sesion: ${s.customTiempo} minutos`);
            }}
          >
            Aplicar
          </BtnOutline>
        </div>
      )}
      {s.sesionTiempo && s.sesionTiempo !== "custom" && s.sesionTiempo !== "" && (
        <p className="text-[11px] text-emerald-700 mt-1.5">
          Tiempo de sesion configurado: {s.sesionTiempo}
        </p>
      )}
      {s.sesionTiempo === "" && (
        <p className="text-[11px] text-muted-foreground mt-1.5">
          La sesion no expirara por inactividad.
        </p>
      )}
    </div>
  );
}

export function SesionesCard({ s }: { s: ReturnType<typeof useSesiones> }) {
  return (
    <Card>
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Monitor size={16} /> Sesiones activas
      </h3>
      <TiempoSesion s={s} />
      <div className="divide-y">
        {s.sessions.map((ses, i) => (
          <div key={i} className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-semibold flex items-center gap-2">
                {ses.d} {ses.curr && <Badge tone="success">Actual</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                {ses.l} · {ses.ip} · {ses.f}
              </div>
            </div>
            {!ses.curr && (
              <button
                onClick={() => s.cerrarSesion(i)}
                className="text-xs text-danger-600 font-semibold flex items-center gap-1"
              >
                <Trash2 size={12} /> Cerrar
              </button>
            )}
          </div>
        ))}
      </div>
      <BtnOutline className="w-full mt-3" onClick={s.cerrarTodas}>
        Cerrar todas las sesiones
      </BtnOutline>
    </Card>
  );
}
