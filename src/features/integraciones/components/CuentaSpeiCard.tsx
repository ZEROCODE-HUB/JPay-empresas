import { Badge, Card } from "@/components/portal-shell";
import { useEstadoCuentaSpei } from "@/hooks/useCobre";
import { ErrorCarga } from "@/shared/ui/estado-carga";
import { brand } from "@/brand/brand";
import { SolicitudActivacion } from "./SolicitudActivacion";

const EN_REVISION = ["enviando", "processing", "approved"];

/** CLABE en grupos (banco, plaza, cuenta, dígito): más fácil de leer y dictar. */
const clabeLegible = (c: string) => c.replace(/^(\d{3})(\d{3})(\d{11})(\d)$/, "$1 $2 $3 $4");

/**
 * Cuenta SPEI del cliente: su CLABE para recibir y enviar transferencias. La activa el equipo de
 * la plataforma (el cliente no conecta nada por su cuenta): aquí ve el estado y pide la
 * activación.
 */
export function CuentaSpeiCard() {
  const q = useEstadoCuentaSpei();

  if (q.isLoading) return <Card className="text-sm text-black-400">Cargando…</Card>;
  if (q.error || !q.data) {
    return <ErrorCarga error={q.error} onRetry={() => void q.refetch()} />;
  }

  const c = q.data;
  const clabe = c.cuenta?.clabe ?? null;
  const enRevision =
    !clabe && (!!c.cuenta || c.instanciaPropia || EN_REVISION.includes(c.alta?.estado ?? ""));
  const estado = clabe
    ? ({ label: "Activa", tone: "success" } as const)
    : enRevision
      ? ({ label: "En activación", tone: "warn" } as const)
      : ({ label: "Sin activar", tone: "neutral" } as const);

  return (
    <Card>
      <h2 className="font-semibold flex items-center gap-2">
        Cuenta SPEI
        <Badge tone={estado.tone}>{estado.label}</Badge>
        {clabe && c.modo !== "produccion" && <Badge tone="warn">Pruebas</Badge>}
      </h2>
      <p className="text-sm text-black-400 mt-1 max-w-xl">
        Tu cuenta con CLABE propia para recibir depósitos, cobrar por transferencia y enviar SPEI,
        uno por uno o en lote.
      </p>

      {clabe ? (
        <dl className="mt-5 grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-black-400">Tu CLABE</dt>
            <dd className="font-mono">{clabeLegible(clabe)}</dd>
          </div>
          <div>
            <dt className="text-xs text-black-400">Estado</dt>
            <dd>
              {(c.cuenta?.conectividad ?? "connected") === "connected"
                ? "Lista para operar"
                : "En verificación: todavía no opera SPEI"}
            </dd>
          </div>
        </dl>
      ) : enRevision ? (
        <p className="mt-4 text-sm text-black-500">
          Estamos terminando de activar tu cuenta. En cuanto tenga su CLABE la verás aquí y podrás
          usar SPEI.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-black-500">
            La activa un ejecutivo de {brand.name}. Pídela aquí y te contactamos para completar el
            alta.
          </p>
          <SolicitudActivacion
            servicio="cuenta_spei"
            etiqueta="Solicitar activación"
            titulo="Activar tu cuenta SPEI"
            descripcion={`Confirma tus datos y un ejecutivo de ${brand.name} te contactará para activar tu cuenta.`}
            ejemplo="Por ejemplo: para qué usarás la cuenta o el mejor horario para llamarte"
          />
        </div>
      )}
    </Card>
  );
}
