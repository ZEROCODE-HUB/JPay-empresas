import { useState } from "react";
import { Check, CheckCircle2, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Badge, BtnOutline, BtnPrimary, Card } from "@/components/portal-shell";
import { useConexionEcartPay, useConexionEcartPayMutaciones } from "@/hooks/useIntegraciones";
import type { EstadoConexion } from "@/lib/api/integraciones";
import { mensajeError } from "@/shared/errores";
import { formatDateTime } from "@/shared/format";
import { usePaisConModulos } from "@/shared/modulos-pais";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { brand } from "@/brand/brand";
import { SolicitudActivacion } from "./SolicitudActivacion";

const ESTADO: Record<
  EstadoConexion,
  { label: string; tone: "neutral" | "success" | "warn" | "danger" }
> = {
  sin_conectar: { label: "Sin vincular", tone: "neutral" },
  pendiente: { label: "Pendiente", tone: "warn" },
  conectado: { label: "Activos", tone: "success" },
  revocado: { label: "Desvinculada", tone: "neutral" },
  error: { label: "Con errores", tone: "danger" },
};

/**
 * Cobros con tarjeta del comercio: qué incluye el servicio, el botón para vincular su cuenta de
 * cobros (autorización en la página del procesador de pagos) y el contacto con soporte para que
 * se la activen. En pantalla no se nombra al proveedor.
 */
export function EcartPayCard({ comercioId }: { comercioId: string }) {
  const { data: c, isLoading, error } = useConexionEcartPay(comercioId);
  const { conectar, desconectar } = useConexionEcartPayMutaciones();
  const [confirmar, setConfirmar] = useState(false);
  const pais = usePaisConModulos();

  if (isLoading) return <Card className="text-sm text-black-400">Cargando…</Card>;
  if (error || !c) {
    return (
      <Card className="text-sm text-danger-600">No se pudo leer el estado de tus cobros.</Card>
    );
  }
  const conectado = c.estado === "conectado";
  const estado = ESTADO[c.estado];
  const m = pais.modulos;

  // Lo que incluye el servicio, según lo que tenga habilitado el país.
  const incluye = [
    `Links de pago: cobra con tarjeta de crédito y débito${m.msi ? ", con meses sin intereses" : ""}${m.spei ? ", por transferencia SPEI" : ""}${m.oxxo ? " y en efectivo en tiendas OXXO" : ""}.`,
    m.suscripciones && "Suscripciones: cobros recurrentes a la tarjeta de tus clientes.",
    m.domiciliacion &&
      "Domiciliación: cargos recurrentes a la cuenta bancaria de tus clientes, con su autorización.",
    m.pos && "Puntos físicos: sucursales, cajas y terminales para cobrar en tu local.",
    m.retiros_proveedor && `Retiros: lo que cobras llega a tu cuenta ${brand.name}.`,
    "Reembolsos, contracargos y reportes de todo lo cobrado.",
  ].filter((x): x is string => typeof x === "string");

  const iniciar = () =>
    conectar.mutate(comercioId, { onError: (e) => toast.error(mensajeError(e)) });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            Cobros con tarjeta
            <Badge tone={estado.tone}>{estado.label}</Badge>
            {conectado && c.entorno === "sandbox" && <Badge tone="warn">Pruebas</Badge>}
          </h2>
          <p className="text-sm text-black-400 mt-1 max-w-xl">
            Cobra a tus clientes en línea y en tu local. El dinero de cada cobro llega a tu cuenta
            de cobros y de ahí lo retiras.
          </p>
        </div>
        {conectado && (
          <BtnOutline onClick={() => setConfirmar(true)} disabled={desconectar.isPending}>
            <Unlink size={16} /> Desvincular
          </BtnOutline>
        )}
      </div>

      <ul className="mt-4 space-y-1.5 text-sm text-black-500">
        {incluye.map((t) => (
          <li key={t} className="flex gap-2">
            <Check size={16} className="mt-0.5 shrink-0 text-success" />
            <span>{t}</span>
          </li>
        ))}
      </ul>

      {conectado ? (
        <dl className="mt-5 grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-black-400">Vinculada el</dt>
            <dd>{c.conectadoAt ? formatDateTime(c.conectadoAt) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-black-400">Cuenta de cobros</dt>
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
      ) : (
        <div className="mt-5 rounded-md border border-primary-200 bg-primary-50 p-4">
          <p className="text-sm text-black-500">
            Si ya tienes tu cuenta de cobros, vincúlala con tu usuario. Si todavía no la tienes o
            necesitas ayuda, escríbenos y un ejecutivo de {brand.name} la activa contigo.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <BtnPrimary onClick={iniciar} disabled={conectar.isPending}>
              <Link2 size={16} />
              {conectar.isPending
                ? "Abriendo…"
                : c.estado === "revocado" || c.estado === "error"
                  ? "Volver a vincular"
                  : "Vincular mi cuenta de cobros"}
            </BtnPrimary>
            <SolicitudActivacion
              servicio="cobros_tarjeta"
              comercioId={comercioId}
              etiqueta="Contactar a soporte para activación"
              titulo="Activar cobros con tarjeta"
              descripcion={`Confirma tus datos y un ejecutivo de ${brand.name} te contactará para activar tus cobros con tarjeta.`}
              ejemplo="Por ejemplo: qué vendes, cuánto esperas cobrar al mes o el mejor horario para llamarte"
            />
          </div>
        </div>
      )}

      {c.estado === "revocado" && c.revocadoAt && (
        <p className="mt-4 text-xs text-black-400">
          Desvinculada el {formatDateTime(c.revocadoAt)}.
        </p>
      )}
      {c.ultimoError && !conectado && (
        <p className="mt-4 text-xs text-danger-600">
          El último intento de vinculación no se completó. Vuelve a intentarlo o contacta a soporte.
        </p>
      )}

      <ConfirmDialog
        open={confirmar}
        onClose={() => setConfirmar(false)}
        title="Desvincular cobros con tarjeta"
        variant="danger"
        confirmLabel="Desvincular"
        closeOnConfirm
        message={
          <>
            {brand.name} deja de cobrar en tu cuenta de cobros con tarjeta y borra las claves
            guardadas: tus links de pago, suscripciones y terminales dejan de cobrar hasta que la
            vuelvas a vincular.
          </>
        }
        onConfirm={() =>
          desconectar.mutateAsync(comercioId).then(
            () => {
              toast.success("Cobros con tarjeta desvinculados");
            },
            (e) => {
              toast.error(mensajeError(e));
              throw e;
            },
          )
        }
      />
    </Card>
  );
}
