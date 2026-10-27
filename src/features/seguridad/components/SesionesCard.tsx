import { Monitor } from "lucide-react";
import { Badge, BtnOutline, Card } from "@/components/portal-shell";
import { formatDateTime } from "@/shared/format";
import type { useSesiones } from "../hooks/useSesiones";

export function SesionesCard({ s }: { s: ReturnType<typeof useSesiones> }) {
  return (
    <Card>
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Monitor size={16} /> Sesiones activas
      </h3>
      <div className="divide-y">
        {s.loadingUsuario ? (
          <p className="py-3 text-sm text-muted-foreground">Cargando sesión…</p>
        ) : s.usuario ? (
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-semibold flex items-center gap-2">
                Este dispositivo <Badge tone="success">Actual</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {s.usuario.email ?? "—"} · Último inicio de sesión:{" "}
                {formatDateTime(s.usuario.last_sign_in_at)}
              </div>
            </div>
          </div>
        ) : (
          <p className="py-3 text-sm text-muted-foreground">No hay una sesión activa.</p>
        )}
      </div>
      <BtnOutline className="w-full mt-3" onClick={s.cerrarTodas}>
        Cerrar todas las sesiones
      </BtnOutline>
    </Card>
  );
}
