import { useState } from "react";
import { toast } from "sonner";
import { BtnOutline, BtnPrimary, Card, Input } from "@/components/portal-shell";
import { useCuentaRetiroMutaciones, usePreparacionCuentaRetiro } from "@/hooks/useIntegraciones";
import { mensajeError } from "@/shared/errores";
import { brand } from "@/brand/brand";

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/**
 * Aviso para vincular la CLABE de la cuenta del cliente (Cobre, banco TESORED) como cuenta de
 * retiro en el procesador de pagos: lo cobrado con tarjeta se retira directo ahí. Todos los datos
 * los ponemos nosotros; el procesador solo pide un código que le llega por correo al dueño.
 * Desaparece cuando la CLABE ya está vinculada.
 */
export function ActivarRetirosAviso() {
  const prep = usePreparacionCuentaRetiro();
  const m = useCuentaRetiroMutaciones();
  const [enviado, setEnviado] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [rfc, setRfc] = useState("");

  const d = prep.data;
  if (!d || d.vinculada || d.clabes.length === 0) return null;
  const clabe = d.clabes[0];
  const faltaRfc = !d.rfc;

  const enviarCodigo = () =>
    m.enviarCodigo.mutate(undefined, {
      onSuccess: () => {
        setEnviado(true);
        toast.success("Te enviamos un código a tu correo");
      },
      onError: (e) => toast.error(mensajeError(e)),
    });

  const activar = async () => {
    const r = rfc.trim().toUpperCase();
    if (faltaRfc && !RFC.test(r)) return toast.error("El RFC no es válido (12 o 13 caracteres)");
    if (!/^\d{4,8}$/.test(codigo.trim())) return toast.error("Escribe el código que te llegó");
    try {
      await m.crear.mutateAsync({ codigo: codigo.trim(), ...(faltaRfc ? { rfc: r } : {}) });
      toast.success("Listo: tus cobros con tarjeta se retirarán a tu cuenta " + brand.name);
    } catch (e) {
      toast.error(mensajeError(e));
    }
  };

  return (
    <Card className="mb-4 border-primary-200 bg-primary-50">
      <h2 className="font-semibold">Activa los retiros a tu cuenta {brand.name}</h2>
      <p className="mt-1 text-sm text-black-500">
        Para recibir lo que cobras con tarjeta en tu cuenta {brand.name} (CLABE ••••
        {clabe.clabe.slice(-4)}
        {clabe.banco ? `, ${clabe.banco.nombre}` : ""}), confirma con el código que te enviaremos a
        tu correo.
      </p>
      {!enviado ? (
        <BtnPrimary className="mt-3" onClick={enviarCodigo} disabled={m.enviarCodigo.isPending}>
          {m.enviarCodigo.isPending ? "Enviando…" : "Activar"}
        </BtnPrimary>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {faltaRfc && (
            <Input
              aria-label="RFC del titular"
              placeholder="RFC del titular"
              value={rfc}
              maxLength={13}
              onChange={(e) => setRfc(e.target.value.toUpperCase())}
              className="w-44 font-mono"
            />
          )}
          <Input
            aria-label="Código de verificación"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Código de tu correo"
            value={codigo}
            maxLength={8}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            className="w-44"
          />
          <BtnPrimary onClick={activar} disabled={m.crear.isPending}>
            {m.crear.isPending ? "Activando…" : "Confirmar"}
          </BtnPrimary>
          <BtnOutline onClick={enviarCodigo} disabled={m.enviarCodigo.isPending}>
            Reenviar código
          </BtnOutline>
        </div>
      )}
    </Card>
  );
}
