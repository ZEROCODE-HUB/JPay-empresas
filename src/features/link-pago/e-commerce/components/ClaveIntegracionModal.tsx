import { Key, X } from "lucide-react";
import { BtnOutline, Input, Label } from "@/components/portal-shell";
import type { IntegracionesEcom } from "../hooks/useIntegracionesEcom";

/** Modal: Actualizar clave / Conectar */
export function ClaveIntegracionModal({ s }: { s: IntegracionesEcom }) {
  const { claveModal, setClaveModal, claveApi, webhookUrl } = s;
  if (!claveModal) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setClaveModal(null)} />
      <div
        className="relative bg-card rounded-lg max-w-md w-full p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Conectar {claveModal.name}</h3>
          <button
            onClick={() => setClaveModal(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <Label>API Key</Label>
            <Input
              value={claveApi}
              onChange={(e) => s.setClaveApi(e.target.value)}
              placeholder="Ingresa la API key de {claveModal.name}"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Webhook URL (opcional)</Label>
            <Input
              value={webhookUrl}
              onChange={(e) => s.setWebhookUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1"
            />
          </div>
          <div className="text-xs text-muted-foreground pt-1 leading-relaxed">
            Las credenciales se cifran y almacenan de forma segura. Podes actualizarlas en cualquier
            momento.
          </div>
          <BtnOutline
            className="w-full mt-2"
            onClick={() => {
              if (!claveModal) return;
              s.connectIntegration(claveModal.id, claveModal.name, claveApi, webhookUrl);
            }}
          >
            <Key size={14} /> Conectar
          </BtnOutline>
        </div>
      </div>
    </div>
  );
}
