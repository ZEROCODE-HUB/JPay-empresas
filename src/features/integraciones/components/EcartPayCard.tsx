import { useState } from "react";
import { CheckCircle2, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Badge, BtnOutline, BtnPrimary, Card } from "@/components/portal-shell";
import { useConexionEcartPay, useConexionEcartPayMutaciones } from "@/hooks/useIntegraciones";
import type { EstadoConexion } from "@/lib/api/integraciones";
import { formatDateTime } from "@/shared/format";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";

const ESTADO: Record<
  EstadoConexion,
  { label: string; tone: "neutral" | "success" | "warn" | "danger" }
> = {
  sin_conectar: { label: "Sin conectar", tone: "neutral" },
  pendiente: { label: "Pendiente", tone: "warn" },
  conectado: { label: "Conectado", tone: "success" },
  revocado: { label: "Desconectado", tone: "neutral" },
  error: { label: "Con errores", tone: "danger" },
};

/** Conexión del comercio con su cuenta de Ecart Pay (OAuth). */
export function EcartPayCard({ comercioId }: { comercioId: string }) {
  const { data: c, isLoading, error } = useConexionEcartPay(comercioId);
  const { conectar, desconectar } = useConexionEcartPayMutaciones();
  const [confirmar, setConfirmar] = useState(false);

  if (isLoading) return <Card className="text-sm text-black-400">Cargando…</Card>;
  if (error || !c) {
    return (
      <Card className="text-sm text-danger-600">No se pudo leer el estado de la conexión.</Card>
    );
  }
  const conectado = c.estado === "conectado";
  const estado = ESTADO[c.estado];

  const iniciar = () =>
    conectar.mutate(comercioId, { onError: (e) => toast.error((e as Error).message) });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            Ecart Pay
            <Badge tone={estado.tone}>{estado.label}</Badge>
            {conectado && c.entorno === "sandbox" && <Badge tone="warn">Pruebas</Badge>}
          </h2>
          <p className="text-sm text-black-400 mt-1 max-w-xl">
            Conectá tu cuenta de Ecart Pay para cobrar con tarjeta, transferencia y efectivo. El
            dinero de cada cobro llega a tu cuenta de Ecart Pay.
          </p>
        </div>
        {conectado ? (
          <BtnOutline onClick={() => setConfirmar(true)} disabled={desconectar.isPending}>
            <Unlink size={16} /> Desconectar
          </BtnOutline>
        ) : (
          <BtnPrimary onClick={iniciar} disabled={conectar.isPending}>
            <Link2 size={16} />
            {conectar.isPending
              ? "Abriendo Ecart Pay…"
              : c.estado === "revocado" || c.estado === "error"
                ? "Volver a conectar"
                : "Conectar Ecart Pay"}
          </BtnPrimary>
        )}
      </div>

      {conectado && (
        <dl className="mt-5 grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-black-400">Conectada el</dt>
            <dd>{c.conectadoAt ? formatDateTime(c.conectadoAt) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-black-400">Cuenta Ecart Pay</dt>
            <dd className="font-mono text-xs break-all">{c.cuentaExternaId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-black-400">Permisos otorgados</dt>
            <dd className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-success" />
              {c.scopes.length}
            </dd>
          </div>
        </dl>
      )}
      {c.estado === "revocado" && c.revocadoAt && (
        <p className="mt-4 text-xs text-black-400">
          Desconectada el {formatDateTime(c.revocadoAt)}.
        </p>
      )}
      {c.ultimoError && !conectado && (
        <p className="mt-4 text-xs text-danger-600">Último error: {c.ultimoError}</p>
      )}

      <ConfirmDialog
        open={confirmar}
        onClose={() => setConfirmar(false)}
        title="Desconectar Ecart Pay"
        variant="danger"
        confirmLabel="Desconectar"
        closeOnConfirm
        message={
          <>
            JPay deja de cobrar en tu cuenta de Ecart Pay y borra las claves guardadas. Para quitar
            también el permiso, revocá la aplicación JPay desde tu panel de Ecart Pay.
          </>
        }
        onConfirm={() =>
          desconectar.mutateAsync(comercioId).then(
            () => {
              toast.success("Cuenta de Ecart Pay desconectada");
            },
            (e) => {
              toast.error((e as Error).message);
              throw e;
            },
          )
        }
      />
    </Card>
  );
}
