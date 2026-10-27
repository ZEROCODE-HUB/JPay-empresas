import type { MutableRefObject } from "react";
import { KeyRound } from "lucide-react";
import { FormDialog } from "@/shared/ui/form-dialog";

/** Reparte los dígitos pegados/escritos en las 6 casillas. */
const enCasillas = (digits: string[]) =>
  Array(6)
    .fill("")
    .map((_, idx) => digits[idx] ?? "");

/** Verificación de dos factores (código de 6 dígitos enviado por correo). */
export function OtpDialog({
  open,
  digitos: otp,
  setDigitos: setOtp,
  refs: otpRefs,
  sending: otpSending,
  verifying: otpVerifying,
  cerrar,
  confirmar,
  reenviar,
}: {
  open: boolean;
  digitos: string[];
  setDigitos: (d: string[]) => void;
  refs: MutableRefObject<(HTMLInputElement | null)[]>;
  sending: boolean;
  verifying: boolean;
  cerrar: () => void;
  confirmar: () => void | Promise<void>;
  reenviar: () => void | Promise<void>;
}) {
  return (
    <FormDialog
      open={open}
      onClose={cerrar}
      title="Verificacion de dos factores"
      description={
        otpSending
          ? "Enviando código a tu correo..."
          : "Ingresa el codigo de 6 digitos enviado a tu correo."
      }
      submitLabel={
        otpVerifying
          ? "Verificando..."
          : otpSending
            ? "Enviando código..."
            : "Verificar y confirmar"
      }
      onSubmit={confirmar}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-2 py-2">
          <KeyRound size={18} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {otpSending ? "Enviando código..." : "Codigo de verificacion"}
          </span>
        </div>
        <div className="flex justify-center gap-2">
          {otp.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                otpRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                // Soporta pegar código completo en una sola casilla
                if (raw.length > 1) {
                  const digits = raw.slice(0, 6).split("");
                  setOtp(enCasillas(digits));
                  const last = Math.min(digits.length, 6) - 1;
                  otpRefs.current[last]?.focus();
                  return;
                }
                const val = raw.slice(0, 1);
                const next = [...otp];
                next[i] = val;
                setOtp(next);
                if (val && i < 5) otpRefs.current[i + 1]?.focus();
              }}
              onPaste={(e) => {
                e.preventDefault();
                const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                if (!pasted) return;
                const digits = pasted.split("");
                setOtp(enCasillas(digits));
                const focusIdx = Math.min(digits.length, 6) - 1;
                otpRefs.current[focusIdx]?.focus();
              }}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
              }}
              onFocus={(e) => e.target.select()}
              className="w-11 h-12 text-center text-lg font-bold rounded-md border bg-card outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
              autoComplete="one-time-code"
            />
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground pt-1">
          <span>¿No recibiste el codigo?</span>
          <button
            type="button"
            className="text-primary-ink font-semibold hover:underline disabled:opacity-50"
            disabled={otpSending}
            onClick={() => {
              void reenviar();
            }}
          >
            {otpSending ? "Enviando..." : "Reenviar"}
          </button>
        </div>
      </div>
    </FormDialog>
  );
}
