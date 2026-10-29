import { useState } from "react";
import { toast } from "sonner";
import { Badge, BtnOutline, BtnPrimary, Card, Input, Label } from "@/components/portal-shell";
import { useCuentaSpeiMutaciones } from "@/hooks/useCobre";
import { enviarOtpTransferencia } from "@/lib/api/transferencias";
import { nuevoTxid, type DestinatarioSpei, type SubcuentaSpei } from "@/lib/api/cobre";
import { formatMoney, parseMonto } from "@/shared/format";
import { validarClabe, validarCurp, validarRfc } from "@/shared/validadores";
import { VERIFICACION } from "../estados";

const select = "mt-1 w-full h-10 px-3 rounded-md border border-input bg-card text-sm";

/**
 * Transferencia SPEI desde una subcuenta en pesos (sale del Cobre Balance del comercio) a una
 * CLABE. Solo a destinatarios con el titular verificado (`matched`): la verificación se pide sola
 * al guardar el destinatario y tarda unos minutos.
 */
export function TransferirSpeiCard({
  subcuentas,
  destinatarios: todos,
  habilitada,
}: {
  subcuentas: SubcuentaSpei[];
  destinatarios: DestinatarioSpei[];
  /** El comercio ya tiene su Cobre Balance activo. */
  habilitada: boolean;
}) {
  const m = useCuentaSpeiMutaciones();
  const conClabe = subcuentas.filter((s) => s.moneda === "MXN");
  const destinatarios = todos.filter((d) => d.tipo !== "business");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [txid, setTxid] = useState(nuevoTxid);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [dest, setDest] = useState({ clabe: "", titular: "", idNumero: "", alias: "" });

  const sub = conClabe.find((s) => s.id === (origen || conClabe[0]?.id));
  const d = destinatarios.find((x) => x.id === (destino || destinatarios[0]?.id));

  const guardarDestinatario = () => {
    const clabe = dest.clabe.replace(/\D/g, "");
    const id = dest.idNumero.trim().toUpperCase();
    const errClabe = validarClabe(clabe);
    if (errClabe) return toast.error(errClabe);
    if (!dest.titular.trim()) return toast.error("Falta el nombre del titular");
    const idTipo = id.length === 18 ? "curp" : "rfc";
    const errId = idTipo === "curp" ? validarCurp(id) : validarRfc(id);
    if (errId) return toast.error(errId);
    m.crearDestinatario.mutate(
      {
        numero: clabe,
        titular: dest.titular.trim(),
        idTipo,
        idNumero: id,
        alias: dest.alias || undefined,
      },
      {
        onSuccess: (r) => {
          toast.success("Destinatario guardado; verificamos que la CLABE sea del titular");
          setDestino(r.id);
          setNuevo(false);
          setDest({ clabe: "", titular: "", idNumero: "", alias: "" });
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  const enviar = () => {
    const importe = parseMonto(monto);
    if (!sub) return toast.error("Elegí una subcuenta");
    if (!d) return toast.error("Elegí un destinatario");
    if (!(importe > 0)) return toast.error("Ingresá un monto");
    if (importe > sub.saldoDisponible) return toast.error("El monto supera el saldo disponible");
    m.enviar.mutate(
      {
        subcuentaId: sub.id,
        destinatarioId: d.id,
        monto: importe,
        concepto: concepto.trim() || "Transferencia",
        idTxn: txid,
        codigo: codigo ?? undefined,
      },
      {
        onSuccess: (r) => {
          toast.success(
            r.estado === "pendiente_aprobacion"
              ? "Transferencia enviada a aprobación"
              : (r.aviso ?? `Transferencia enviada (${r.id_txn})`),
          );
          setMonto("");
          setConcepto("");
          setCodigo(null);
          setTxid(nuevoTxid());
        },
        onError: (e) => {
          const msg = (e as Error).message;
          // Si la plataforma exige OTP, se manda el código por correo y se pide.
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
            // Un rechazo de validación cierra este intento: el próximo envío es otro TXID.
            setTxid(nuevoTxid());
          }
        },
      },
    );
  };

  return (
    <Card>
      <h2 className="font-semibold">Transferir por SPEI</h2>
      {!habilitada || conClabe.length === 0 ? (
        <p className="mt-2 text-sm text-black-400">
          Vas a poder transferir cuando tu cuenta en Cobre esté activa.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="spei-origen">Desde</Label>
            <select
              id="spei-origen"
              className={select}
              value={sub?.id ?? ""}
              onChange={(e) => setOrigen(e.target.value)}
            >
              {conClabe.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} · {formatMoney(s.saldoDisponible)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="spei-destino">A</Label>
              <button
                type="button"
                className="text-xs font-semibold text-secondary hover:underline"
                onClick={() => setNuevo(!nuevo)}
              >
                {nuevo ? "Elegir guardado" : "Nuevo destinatario"}
              </button>
            </div>
            {nuevo || destinatarios.length === 0 ? (
              <div className="mt-1 space-y-2 rounded-md border border-black-100 p-3">
                <Input
                  placeholder="CLABE (18 dígitos)"
                  inputMode="numeric"
                  value={dest.clabe}
                  onChange={(e) => setDest({ ...dest, clabe: e.target.value })}
                />
                <Input
                  placeholder="Nombre del titular"
                  value={dest.titular}
                  onChange={(e) => setDest({ ...dest, titular: e.target.value })}
                />
                <Input
                  placeholder="RFC o CURP del titular"
                  value={dest.idNumero}
                  onChange={(e) => setDest({ ...dest, idNumero: e.target.value })}
                />
                <Input
                  placeholder="Alias (opcional)"
                  value={dest.alias}
                  onChange={(e) => setDest({ ...dest, alias: e.target.value })}
                />
                <BtnOutline onClick={guardarDestinatario} disabled={m.crearDestinatario.isPending}>
                  {m.crearDestinatario.isPending ? "Guardando…" : "Guardar destinatario"}
                </BtnOutline>
              </div>
            ) : (
              <>
                <select
                  id="spei-destino"
                  className={select}
                  value={d?.id ?? ""}
                  onChange={(e) => setDestino(e.target.value)}
                >
                  {destinatarios.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.alias || x.titular} · {x.numero.slice(-4)}
                    </option>
                  ))}
                </select>
                {d && (
                  <div className="mt-1 text-xs">
                    <Badge tone={VERIFICACION[d.verificacion].tone}>
                      {VERIFICACION[d.verificacion].label}
                    </Badge>
                    <span className="ml-2 text-black-400">
                      {d.titular} · {d.idNumero}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
          <div>
            <Label htmlFor="spei-monto">Monto</Label>
            <Input
              id="spei-monto"
              className="mt-1"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="spei-concepto">Concepto</Label>
            <Input
              id="spei-concepto"
              className="mt-1"
              maxLength={40}
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
            />
          </div>
          {codigo !== null && (
            <div>
              <Label htmlFor="spei-codigo">Código que te enviamos por correo</Label>
              <Input
                id="spei-codigo"
                className="mt-1"
                inputMode="numeric"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          )}
          <div className="md:col-span-2 flex items-center justify-between gap-3">
            <p className="text-xs text-black-400">
              Se descuentan el monto y la comisión de tu saldo. Las transferencias grandes pueden
              quedar pendientes de aprobación.
            </p>
            <BtnPrimary
              onClick={enviar}
              disabled={m.enviar.isPending || (d?.tipo === "clabe" && d.verificacion !== "matched")}
            >
              {m.enviar.isPending ? "Enviando…" : "Transferir"}
            </BtnPrimary>
          </div>
        </div>
      )}
    </Card>
  );
}
