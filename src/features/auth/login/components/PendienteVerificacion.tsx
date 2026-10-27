import { DemoVerifyBox, PrimaryButton, SuccessCard } from "@/features/onboarding/components";
import { brand, mailto } from "@/brand/brand";
import type { LoginFormState } from "../hooks/useLoginForm";

/** Recuadro para pendiente_verificacion en lugar de letras rojas. */
export function PendienteVerificacion({ f }: { f: LoginFormState }) {
  return (
    <SuccessCard
      variant="info"
      title="Pendiente de verificación de email"
      body={
        <>
          <p>
            Tu correo aún no está verificado. Revisá tu bandeja de entrada y hacé clic en el enlace
            para activar tu cuenta.
          </p>
          <p className="mt-3 text-xs text-black-400">
            Si no lo recibís, revisá spam o reenviá el correo. Si tenés algún problema,{" "}
            <a
              href={mailto(brand.contact.support)}
              className="underline underline-offset-2 hover:text-primary-ink"
            >
              ¿Necesitas ayuda? Soporte
            </a>
            .
          </p>
          {f.demoUrl && <DemoVerifyBox url={f.demoUrl} />}
          {f.resendMsg && <p className="mt-3 text-xs text-green-600">{f.resendMsg}</p>}
        </>
      }
    >
      <PrimaryButton onClick={f.reenviarVerificacion} disabled={f.resendLoading}>
        {f.resendLoading ? "Reenviando…" : "Reenviar correo de verificación"}
      </PrimaryButton>
      <button
        type="button"
        onClick={f.volverAlLogin}
        className="mt-2 w-full text-xs text-black-400 hover:text-primary-ink underline underline-offset-2"
      >
        Volver al inicio de sesión
      </button>
    </SuccessCard>
  );
}
