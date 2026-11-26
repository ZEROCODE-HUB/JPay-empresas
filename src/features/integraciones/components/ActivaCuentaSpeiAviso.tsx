import { Link } from "@tanstack/react-router";
import { Card } from "@/components/portal-shell";
import type { CuentaCobre } from "@/lib/api/cobre";
import { brand } from "@/brand/brand";
import { SolicitudActivacion } from "./SolicitudActivacion";

const EN_REVISION = ["enviando", "processing", "approved"];

/**
 * Aviso de las pantallas de SPEI y dólares cuando el cliente todavía no tiene su cuenta SPEI
 * lista: si no la pidió, el botón para solicitar la activación; si ya está en trámite, que espere.
 * Devuelve null si la cuenta ya existe.
 */
export function ActivaCuentaSpeiAviso({
  cuenta,
  para = "usar SPEI",
}: {
  cuenta: CuentaCobre | undefined;
  /** Qué habilita la cuenta, para el texto («enviar transferencias», …). */
  para?: string;
}) {
  if (!cuenta || cuenta.cuenta) return null;
  const enTramite = cuenta.instanciaPropia || EN_REVISION.includes(cuenta.alta?.estado ?? "");
  return (
    <Card className="border-primary-200 bg-primary-50">
      <h2 className="font-semibold">
        {enTramite ? "Tu cuenta SPEI está en activación" : "Activa tu cuenta SPEI"}
      </h2>
      <p className="mt-1 text-sm text-black-500 max-w-2xl">
        {enTramite
          ? `Estamos terminando de activar tu cuenta. En cuanto tenga su CLABE podrás ${para}.`
          : `Para ${para} necesitas tu cuenta SPEI, con CLABE propia. La activa un ejecutivo de ${brand.name}: pídela y te contactamos.`}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!enTramite && (
          <SolicitudActivacion
            servicio="cuenta_spei"
            etiqueta="Solicitar activación"
            titulo="Activar tu cuenta SPEI"
            descripcion={`Confirma tus datos y un ejecutivo de ${brand.name} te contactará para activar tu cuenta.`}
            ejemplo="Por ejemplo: para qué usarás la cuenta o el mejor horario para llamarte"
          />
        )}
        <Link
          to="/app/integraciones"
          className="text-sm font-semibold text-secondary hover:underline"
        >
          Ver el estado en Conexiones
        </Link>
      </div>
    </Card>
  );
}
