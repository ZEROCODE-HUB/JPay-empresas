import { toast } from "sonner";
import { Badge, Card } from "@/components/portal-shell";
import { useCuentaSpei, useKybCobre } from "@/hooks/useCobre";
import { KybCobreForm } from "@/shared/ui/kyb-cobre";

const ALTA: Record<string, { label: string; tone: "success" | "warn" | "danger" | "neutral" }> = {
  enviando: { label: "Alta enviada", tone: "warn" },
  processing: { label: "En revisión por Cobre", tone: "warn" },
  approved: { label: "Aprobada", tone: "success" },
  rejected: { label: "Rechazada", tone: "danger" },
  failed: { label: "Con error", tone: "danger" },
  error_envio: { label: "No enviada", tone: "danger" },
};

/**
 * Datos que pide Cobre para abrir la cuenta del comercio (alta como Subcliente): con todo
 * completo, JPay envía el alta. Mientras Cobre la revisa o ya está aprobada no se editan.
 */
export function AltaCobreCard() {
  const { cuenta } = useCuentaSpei();
  const kyb = useKybCobre();
  const alta = cuenta.data?.alta;
  const bloqueada = !!alta && ["enviando", "processing", "approved"].includes(alta.estado);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Cuenta en Cobre (SPEI y dólares)</h2>
          <p className="text-xs text-black-400 mt-1">
            Datos de la empresa, representantes legales y beneficiarios finales para abrir tu
            cuenta.
          </p>
        </div>
        {alta && (
          <Badge tone={ALTA[alta.estado]?.tone ?? "neutral"}>
            {ALTA[alta.estado]?.label ?? alta.estado}
          </Badge>
        )}
      </div>
      {alta?.motivo && !bloqueada && <p className="mt-2 text-sm text-danger-600">{alta.motivo}</p>}
      <div className="mt-4">
        {kyb.datos.isLoading || cuenta.isLoading ? (
          <p className="text-sm text-black-400">Cargando…</p>
        ) : kyb.datos.error ? (
          <p className="text-sm text-danger-600">
            No se pudo cargar: {(kyb.datos.error as Error).message}
          </p>
        ) : kyb.datos.data ? (
          <KybCobreForm
            key={kyb.datos.dataUpdatedAt}
            empresa={kyb.datos.data.empresa}
            personas={kyb.datos.data.personas}
            faltan={bloqueada ? [] : cuenta.data?.faltan}
            soloLectura={bloqueada}
            onGuardarEmpresa={async (e) => {
              await kyb.guardarEmpresa(e);
              toast.success("Datos guardados");
            }}
            onGuardarPersona={async (p) => {
              await kyb.guardarPersona(p);
              toast.success("Persona agregada");
            }}
            onBorrarPersona={kyb.borrarPersona}
            onError={(m) => toast.error(m)}
          />
        ) : null}
      </div>
    </Card>
  );
}
