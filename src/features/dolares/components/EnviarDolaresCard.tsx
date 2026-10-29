import { useState } from "react";
import { toast } from "sonner";
import { Badge, BtnOutline, BtnPrimary, Card, Input, Label } from "@/components/portal-shell";
import { useCuentaSpeiMutaciones } from "@/hooks/useCobre";
import { enviarOtpTransferencia } from "@/lib/api/transferencias";
import {
  nuevoTxid,
  type DestinatarioSpei,
  type DestinatarioUsdForm,
  type SubcuentaSpei,
} from "@/lib/api/cobre";
import { PAISES_ISO3 } from "@/shared/cobre-kyb";
import { formatMoney, parseMonto } from "@/shared/format";
import { VERIFICACION } from "@/features/spei/estados";

const select = "mt-1 w-full h-10 px-3 rounded-md border border-input bg-card text-sm";

const vacio = (): DestinatarioUsdForm => ({
  rail: "fedwire",
  titular: "",
  idTipo: "ein",
  idNumero: "",
  correo: "",
  telefono: "",
  paisConstitucion: "USA",
  direccion: { calle1: "", ciudad: "", estado: "", cp: "", pais: "USA" },
  banco: {
    nombre: "",
    cuenta: "",
    tipoCuenta: "checking",
    aba: "",
    bic: "",
    direccion: { pais: "USA" },
  },
});

/**
 * Pagos en dólares: Fedwire (cuentas en Estados Unidos, con ABA) o SWIFT (bancos del exterior, con
 * BIC). Salen de la subcuenta en dólares; JPay mueve los fondos al Balance USA y Cobre paga.
 * Cobre verifica cada beneficiario antes del primer pago. Mínimo 1.00 USD.
 */
export function EnviarDolaresCard({
  subcuentas,
  destinatarios: todos,
  habilitada,
}: {
  subcuentas: SubcuentaSpei[];
  destinatarios: DestinatarioSpei[];
  habilitada: boolean;
}) {
  const m = useCuentaSpeiMutaciones();
  const usd = subcuentas.find((s) => s.moneda === "USD");
  const destinatarios = todos.filter((d) => d.tipo === "business");
  const [nuevo, setNuevo] = useState<DestinatarioUsdForm | null>(null);
  const [destino, setDestino] = useState("");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [txid, setTxid] = useState(nuevoTxid);
  const [codigo, setCodigo] = useState<string | null>(null);
  const d = destinatarios.find((x) => x.id === (destino || destinatarios[0]?.id));

  const guardar = () => {
    if (!nuevo) return;
    if (!nuevo.titular.trim() || !nuevo.banco.nombre.trim() || !nuevo.banco.cuenta.trim()) {
      return toast.error("Completá beneficiario, banco y número de cuenta");
    }
    m.crearDestinatarioUsd.mutate(nuevo, {
      onSuccess: (r) => {
        toast.success("Beneficiario guardado; Cobre lo verifica antes del primer pago");
        setDestino(r.id);
        setNuevo(null);
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const enviar = () => {
    const importe = parseMonto(monto);
    if (!usd) return toast.error("Primero convertí pesos a dólares");
    if (!d) return toast.error("Elegí un beneficiario");
    if (!(importe >= 1)) return toast.error("El mínimo es 1.00 USD");
    if (importe > usd.saldoDisponible) return toast.error("El monto supera tu saldo en dólares");
    m.enviar.mutate(
      {
        subcuentaId: usd.id,
        destinatarioId: d.id,
        monto: importe,
        concepto: concepto.trim() || "Pago",
        idTxn: txid,
        codigo: codigo ?? undefined,
      },
      {
        onSuccess: (r) => {
          toast.success(
            r.estado === "pendiente_aprobacion" ? "Envío enviado a aprobación" : "Envío en proceso",
          );
          setMonto("");
          setConcepto("");
          setCodigo(null);
          setTxid(nuevoTxid());
        },
        onError: (e) => {
          const msg = (e as Error).message;
          if (/código/i.test(msg) && codigo === null) {
            enviarOtpTransferencia().then(
              () => {
                setCodigo("");
                toast.info("Te enviamos un código por correo para confirmar");
              },
              () => toast.error(msg),
            );
          } else {
            toast.error(msg);
            setTxid(nuevoTxid());
          }
        },
      },
    );
  };

  const campo = (
    id: string,
    label: string,
    valor: string,
    cambiar: (v: string) => void,
    extra: Record<string, unknown> = {},
  ) => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className="mt-1"
        value={valor}
        onChange={(e) => cambiar(e.target.value)}
        {...extra}
      />
    </div>
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Enviar dólares</h2>
        <span className="text-sm text-black-400">
          Saldo:{" "}
          <span className="font-medium text-foreground">
            {formatMoney(usd?.saldoDisponible ?? 0, { moneda: "USD" })}
          </span>
        </span>
      </div>
      {!habilitada ? (
        <p className="mt-2 text-sm text-black-400">
          Vas a poder enviar dólares cuando tu cuenta en Cobre esté activa.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="usd-destino">Beneficiario</Label>
                <button
                  type="button"
                  className="text-xs font-semibold text-secondary hover:underline"
                  onClick={() => setNuevo(nuevo ? null : vacio())}
                >
                  {nuevo ? "Elegir guardado" : "Nuevo beneficiario"}
                </button>
              </div>
              {!nuevo &&
                (destinatarios.length === 0 ? (
                  <p className="mt-1 text-sm text-black-400">
                    Todavía no tenés beneficiarios en dólares.
                  </p>
                ) : (
                  <>
                    <select
                      id="usd-destino"
                      className={select}
                      value={d?.id ?? ""}
                      onChange={(e) => setDestino(e.target.value)}
                    >
                      {destinatarios.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.alias || x.titular} · {x.rail === "swift" ? "SWIFT" : "Fedwire"} ·{" "}
                          {x.numero.slice(-4)}
                        </option>
                      ))}
                    </select>
                    {d && (
                      <div className="mt-1 text-xs">
                        <Badge tone={VERIFICACION[d.verificacion].tone}>
                          {VERIFICACION[d.verificacion].label}
                        </Badge>
                        {d.motivoVerificacion && (
                          <span className="ml-2 text-danger-600">{d.motivoVerificacion}</span>
                        )}
                      </div>
                    )}
                  </>
                ))}
            </div>
            {nuevo && (
              <div className="md:col-span-2 rounded-md border border-black-100 p-3 grid gap-2 md:grid-cols-2">
                <div>
                  <Label htmlFor="usd-rail">Tipo de pago</Label>
                  <select
                    id="usd-rail"
                    className={select}
                    value={nuevo.rail}
                    onChange={(e) => {
                      const rail = e.target.value as "fedwire" | "swift";
                      setNuevo({ ...nuevo, rail, banco: { ...nuevo.banco, aba: "", bic: "" } });
                    }}
                  >
                    <option value="fedwire">Fedwire (cuenta en Estados Unidos)</option>
                    <option value="swift">SWIFT (banco en otro país)</option>
                  </select>
                </div>
                {campo("usd-titular", "Beneficiario (empresa)", nuevo.titular, (v) =>
                  setNuevo({ ...nuevo, titular: v }),
                )}
                {campo("usd-idnum", "Identificación fiscal", nuevo.idNumero, (v) =>
                  setNuevo({ ...nuevo, idNumero: v }),
                )}
                <div>
                  <Label htmlFor="usd-pc">País de constitución</Label>
                  <select
                    id="usd-pc"
                    className={select}
                    value={nuevo.paisConstitucion}
                    onChange={(e) => setNuevo({ ...nuevo, paisConstitucion: e.target.value })}
                  >
                    {PAISES_ISO3.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                {campo(
                  "usd-correo",
                  "Correo",
                  nuevo.correo,
                  (v) => setNuevo({ ...nuevo, correo: v }),
                  { type: "email" },
                )}
                {campo("usd-tel", "Teléfono (+código de país)", nuevo.telefono, (v) =>
                  setNuevo({ ...nuevo, telefono: v }),
                )}
                {campo("usd-calle", "Dirección", nuevo.direccion.calle1, (v) =>
                  setNuevo({ ...nuevo, direccion: { ...nuevo.direccion, calle1: v } }),
                )}
                {campo("usd-ciudad", "Ciudad", nuevo.direccion.ciudad, (v) =>
                  setNuevo({ ...nuevo, direccion: { ...nuevo.direccion, ciudad: v } }),
                )}
                {campo("usd-estado", "Estado / provincia", nuevo.direccion.estado, (v) =>
                  setNuevo({ ...nuevo, direccion: { ...nuevo.direccion, estado: v } }),
                )}
                {campo("usd-cp", "Código postal", nuevo.direccion.cp, (v) =>
                  setNuevo({ ...nuevo, direccion: { ...nuevo.direccion, cp: v } }),
                )}
                <div>
                  <Label htmlFor="usd-pais">País del beneficiario</Label>
                  <select
                    id="usd-pais"
                    className={select}
                    value={nuevo.direccion.pais}
                    onChange={(e) =>
                      setNuevo({
                        ...nuevo,
                        direccion: { ...nuevo.direccion, pais: e.target.value },
                      })
                    }
                  >
                    {PAISES_ISO3.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                {campo("usd-banco", "Banco", nuevo.banco.nombre, (v) =>
                  setNuevo({ ...nuevo, banco: { ...nuevo.banco, nombre: v } }),
                )}
                {campo("usd-cuenta", "Número de cuenta (o IBAN)", nuevo.banco.cuenta, (v) =>
                  setNuevo({ ...nuevo, banco: { ...nuevo.banco, cuenta: v } }),
                )}
                {nuevo.rail === "fedwire"
                  ? campo(
                      "usd-aba",
                      "ABA (9 dígitos)",
                      nuevo.banco.aba,
                      (v) => setNuevo({ ...nuevo, banco: { ...nuevo.banco, aba: v } }),
                      { inputMode: "numeric" },
                    )
                  : campo("usd-bic", "BIC / SWIFT", nuevo.banco.bic, (v) =>
                      setNuevo({ ...nuevo, banco: { ...nuevo.banco, bic: v } }),
                    )}
                <div>
                  <Label htmlFor="usd-pb">País del banco</Label>
                  <select
                    id="usd-pb"
                    className={select}
                    value={nuevo.banco.direccion.pais}
                    onChange={(e) =>
                      setNuevo({
                        ...nuevo,
                        banco: { ...nuevo.banco, direccion: { pais: e.target.value } },
                      })
                    }
                  >
                    {PAISES_ISO3.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <BtnOutline onClick={guardar} disabled={m.crearDestinatarioUsd.isPending}>
                    {m.crearDestinatarioUsd.isPending ? "Guardando…" : "Guardar beneficiario"}
                  </BtnOutline>
                </div>
              </div>
            )}
            {campo("usd-monto", "Monto (USD)", monto, setMonto, { inputMode: "decimal" })}
            {campo("usd-concepto", "Concepto", concepto, setConcepto, { maxLength: 40 })}
            {codigo !== null &&
              campo(
                "usd-codigo",
                "Código que te enviamos por correo",
                codigo,
                (v) => setCodigo(v.replace(/\D/g, "")),
                { inputMode: "numeric", maxLength: 6 },
              )}
            <div className="md:col-span-2 flex items-center justify-between gap-3">
              <p className="text-xs text-black-400">
                Fedwire llega en el día hábil; SWIFT depende del banco del beneficiario y de los
                intermediarios.
              </p>
              <BtnPrimary
                onClick={enviar}
                disabled={m.enviar.isPending || !d || d.verificacion !== "verified"}
              >
                {m.enviar.isPending ? "Enviando…" : "Enviar dólares"}
              </BtnPrimary>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
