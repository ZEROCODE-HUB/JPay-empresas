import { Globe, Server, ShieldCheck, Webhook } from "lucide-react";
import { Card } from "@/components/portal-shell";

/** Resumen de capacidades */
export function CapacidadesCard() {
  return (
    <Card className="mb-6">
      <h2 className="text-sm font-semibold mb-4">Capacidades de integracion</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
          <Server size={18} className="text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-semibold">API RESTful</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Documentada y facil de implementar.
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
          <Webhook size={18} className="text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-semibold">Webhooks</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Notificaciones instantaneas de eventos.
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
          <ShieldCheck size={18} className="text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-semibold">Seguridad</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Claves (API keys) y validacion por IP.
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
          <Globe size={18} className="text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-semibold">Compatibilidad</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Marketplaces, carritos externos y plataformas propias.
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
