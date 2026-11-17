import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BtnOutline, Input, Label } from "@/components/portal-shell";
import { useCuentaRetiroMutaciones, usePreparacionCuentaRetiro } from "@/hooks/useIntegraciones";
import { mensajeError } from "@/shared/errores";
import { Cargando, ErrorCarga } from "@/shared/ui/estado-carga";
import { FormDialog } from "@/shared/ui/form-dialog";
import { brand } from "@/brand/brand";

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/**
 * Alta de la cuenta de retiro en el procesador de pagos con la CLABE de la cuenta del cliente (Cobre,
 * banco TESORED): lo cobrado con tarjeta se retira directo al saldo del cliente. El procesador
 * pide un código de un solo uso que le llega por correo al dueño de la cuenta.
 */
export function AgregarCuentaRetiroDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const prep = usePreparacionCuentaRetiro(open);
  const m = useCuentaRetiroMutaciones();
  const [clabe, setClabe] = useState("");
  const [alias, setAlias] = useState(`Cuenta ${brand.name}`);
  const [titular, setTitular] = useState("");
  const [rfc, setRfc] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoEnviado, setCodigoEnviado] = useState(false);

  // Prellenar con lo que ya tenemos apenas llegan los datos.
  useEffect(() => {
    if (!open || !prep.data) return;
    setClabe((v) => v || prep.data.clabes[0]?.clabe || "");
    setTitular((v) => v || prep.data.titular || "");
    setRfc((v) => v || prep.data.rfc || "");
  }, [open, prep.data]);

  // Al cerrar se limpia todo (el código es de un solo uso).
  useEffect(() => {
    if (open) return;
    setClabe("");
    setAlias(`Cuenta ${brand.name}`);
    setTitular("");
    setRfc("");
    setCodigo("");
    setCodigoEnviado(false);
  }, [open]);

  const elegida = prep.data?.clabes.find((c) => c.clabe === clabe);

  const enviarCodigo = () =>
    m.enviarCodigo.mutate(undefined, {
      onSuccess: () => {
        setCodigoEnviado(true);
        toast.success("Te enviamos un código a tu correo");
      },
      onError: (e) => toast.error(mensajeError(e)),
    });

  const guardar = async () => {
    const r = rfc.trim().toUpperCase();
    if (!elegida) return toast.error(`Elige la CLABE de tu cuenta ${brand.name}`);
    if (!elegida.banco)
      return toast.error("El procesador de pagos no reconoce el banco de esa CLABE");
    if (!titular.trim()) return toast.error("Escribe el nombre del titular");
    if (!RFC.test(r)) return toast.error("El RFC no es válido (12 o 13 caracteres)");
    if (!codigoEnviado) return toast.error("Primero pide el código de verificación");
    if (!/^\d{4,8}$/.test(codigo.trim())) return toast.error("Escribe el código que te llegó");
    try {
      await m.crear.mutateAsync({
        clabe,
        alias: alias.trim(),
        titular: titular.trim(),
        rfc: r,
        codigo: codigo.trim(),
      });
      toast.success(
        "Cuenta de retiro agregada. La validación de la CLABE puede tardar unos minutos.",
      );
      onClose();
    } catch (e) {
      toast.error(mensajeError(e));
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Agregar cuenta de retiro"
      description={`Lo que cobras con tarjeta se retira a tu cuenta ${brand.name}.`}
      submitLabel="Agregar cuenta"
      onSubmit={guardar}
      isSubmitting={m.crear.isPending}
    >
      {prep.isLoading ? (
        <Cargando className="block h-40 w-full" />
      ) : prep.error ? (
        <ErrorCarga error={prep.error} onRetry={() => void prep.refetch()} />
      ) : prep.data && prep.data.clabes.length === 0 ? (
        <p className="text-sm text-black-400">
          Todavía no tienes una CLABE en tu cuenta {brand.name}. Cuando se active, podrás usarla
          como cuenta de retiro.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <Label htmlFor="cr-clabe">CLABE de tu cuenta {brand.name}</Label>
            {(prep.data?.clabes.length ?? 0) > 1 ? (
              <select
                id="cr-clabe"
                value={clabe}
                onChange={(e) => setClabe(e.target.value)}
                className="w-full h-10 px-3 rounded-sm border border-black-100 bg-white text-sm"
              >
                {prep.data?.clabes.map((c) => (
                  <option key={c.clabe} value={c.clabe}>
                    {c.clabe}
                    {c.subcuenta ? ` · ${c.subcuenta}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <Input id="cr-clabe" value={clabe} readOnly className="font-mono" />
            )}
            <p className="mt-1 text-xs text-black-400">
              Banco:{" "}
              {elegida?.banco ? (
                <span className="font-medium text-black-700">{elegida.banco.nombre}</span>
              ) : (
                <span className="text-danger-600">no reconocido por el procesador de pagos</span>
              )}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cr-alias">Nombre de la cuenta</Label>
              <Input
                id="cr-alias"
                value={alias}
                maxLength={60}
                onChange={(e) => setAlias(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cr-rfc">RFC del titular</Label>
              <Input
                id="cr-rfc"
                value={rfc}
                maxLength={13}
                onChange={(e) => setRfc(e.target.value.toUpperCase())}
                className="font-mono"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="cr-titular">Titular</Label>
            <Input
              id="cr-titular"
              value={titular}
              maxLength={120}
              onChange={(e) => setTitular(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cr-codigo">Código de verificación</Label>
            <div className="flex gap-2">
              <Input
                id="cr-codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={codigoEnviado ? "Código de tu correo" : "Pide el código primero"}
                value={codigo}
                maxLength={8}
                disabled={!codigoEnviado}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              />
              <BtnOutline type="button" onClick={enviarCodigo} disabled={m.enviarCodigo.isPending}>
                {m.enviarCodigo.isPending
                  ? "Enviando…"
                  : codigoEnviado
                    ? "Reenviar"
                    : "Enviar código"}
              </BtnOutline>
            </div>
            <p className="mt-1 text-xs text-black-400">
              Te llega al correo de tu cuenta de cobros con tarjeta.
            </p>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
