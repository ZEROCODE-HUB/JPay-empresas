import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge, BtnOutline, BtnPrimary, Card, Input, Label } from "@/components/portal-shell";
import { useCuentaSpeiMutaciones } from "@/hooks/useCobre";
import { enviarOtpTransferencia } from "@/lib/api/otp";
import type { DestinatarioSpei, LoteSpei, SubcuentaSpei } from "@/lib/api/cobre";
import { formatDateTime, formatMoney } from "@/shared/format";
import { VERIFICACION } from "../estados";
import { archivoATexto, descargarPlantillaLoteSpei, leerLoteSpei, LARGO_CONCEPTO } from "../lote";

const ESTADO_LOTE: Record<
  string,
  { label: string; tone: "success" | "warn" | "danger" | "neutral" }
> = {
  preparando: { label: "Esperando aprobación", tone: "warn" },
  enviando: { label: "Enviando", tone: "warn" },
  validating: { label: "En validación", tone: "warn" },
  processing: { label: "En proceso", tone: "warn" },
  completed: { label: "Procesado", tone: "success" },
  failed: { label: "Rechazado", tone: "danger" },
  canceled: { label: "Cancelado", tone: "neutral" },
  error_envio: { label: "No enviado", tone: "danger" },
};

/**
 * Envío masivo por SPEI (`/bulk_money_movements` de Cobre): se carga un archivo, se registran los
 * destinatarios nuevos (Cobre verifica cada titular) y, con todos verificados, sale el lote.
 */
export function LoteSpeiCard({
  subcuentas,
  destinatarios,
  lotes,
  habilitada,
}: {
  subcuentas: SubcuentaSpei[];
  destinatarios: DestinatarioSpei[];
  lotes: LoteSpei[];
  habilitada: boolean;
}) {
  const m = useCuentaSpeiMutaciones();
  const pesos = subcuentas.filter((s) => s.moneda === "MXN");
  const [texto, setTexto] = useState("");
  const [origen, setOrigen] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [idLote, setIdLote] = useState(() => `LT${Date.now().toString(36).toUpperCase()}`);

  const filas = useMemo(() => leerLoteSpei(texto, destinatarios), [texto, destinatarios]);
  const sub = pesos.find((s) => s.id === (origen || pesos[0]?.id));
  const total = filas.reduce((s, f) => s + (f.error ? 0 : f.monto), 0);
  const conError = filas.filter((f) => f.error).length;
  const nuevas = filas.filter((f) => !f.error && !f.destinatario);
  const listas =
    filas.length > 0 && filas.every((f) => !f.error && f.destinatario?.verificacion === "matched");

  const cargar = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) return toast.error("El archivo es muy grande (máximo 1 MB)");
    archivoATexto(f).then(setTexto, () => toast.error("No se pudo leer el archivo"));
  };

  const registrar = async () => {
    setRegistrando(true);
    let ok = 0;
    for (const f of nuevas) {
      try {
        await m.crearDestinatario.mutateAsync({
          numero: f.clabe,
          titular: f.titular,
          idTipo: f.idNumero.length === 18 ? "curp" : "rfc",
          idNumero: f.idNumero,
        });
        ok++;
      } catch (e) {
        toast.error(`Fila ${f.n}: ${(e as Error).message}`);
      }
    }
    setRegistrando(false);
    if (ok)
      toast.success(`${ok} destinatarios registrados; verificamos los titulares en unos minutos`);
  };

  const enviar = () => {
    if (!sub) return toast.error("Elige la subcuenta de origen");
    if (total > sub.saldoDisponible) return toast.error("El total supera el saldo disponible");
    m.lote.mutate(
      {
        subcuentaId: sub.id,
        idLote,
        items: filas.map((f) => ({
          contraparteId: f.destinatario!.id,
          monto: f.monto,
          concepto: f.concepto,
        })),
        codigo: codigo ?? undefined,
      },
      {
        onSuccess: (l) => {
          toast.success(l.requiereAprobacion ? "Lote enviado a aprobación" : "Lote enviado");
          setTexto("");
          setCodigo(null);
          setIdLote(`LT${Date.now().toString(36).toUpperCase()}`);
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
            setIdLote(`LT${Date.now().toString(36).toUpperCase()}`);
          }
        },
      },
    );
  };

  return (
    <Card>
      <h2 className="font-semibold">Envío masivo por SPEI</h2>
      <p className="text-xs text-black-400 mt-1">
        Un archivo CSV o Excel con una fila por pago. Descarga la plantilla, reemplaza las filas de
        ejemplo y súbela. Cada destinatario nuevo se verifica antes de pagar.
      </p>
      <ul className="mt-2 text-xs text-black-400 list-disc pl-4 space-y-0.5">
        <li>
          <b>clabe</b>: 18 dígitos · <b>titular</b>: nombre como figura en el banco ·{" "}
          <b>rfc_o_curp</b>: del titular
        </li>
        <li>
          <b>monto</b>: en pesos, con punto decimal (1500.00) · <b>concepto</b>: hasta{" "}
          {LARGO_CONCEPTO} caracteres (opcional)
        </li>
      </ul>
      <div className="mt-3">
        <BtnOutline
          className="h-9 px-3 text-xs"
          onClick={() => {
            descargarPlantillaLoteSpei();
            toast.success("Plantilla descargada");
          }}
        >
          <Download size={14} /> Descargar plantilla
        </BtnOutline>
      </div>
      {!habilitada || pesos.length === 0 ? (
        <p className="mt-2 text-sm text-black-400">
          Vas a poder enviar lotes cuando tu cuenta JPay esté activa.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              onChange={(e) => cargar(e.target.files?.[0])}
              className="text-sm"
            />
            {texto && (
              <button
                type="button"
                className="text-xs text-black-400 hover:underline"
                onClick={() => setTexto("")}
              >
                Quitar archivo
              </button>
            )}
          </div>
          {filas.length > 0 && (
            <>
              <div className="mt-3 max-h-72 overflow-auto rounded-md border border-black-100">
                <table className="w-full text-sm">
                  <thead className="bg-black-50 text-xs text-black-400">
                    <tr>
                      <th className="px-2 py-1 text-left">#</th>
                      <th className="px-2 py-1 text-left">Destinatario</th>
                      <th className="px-2 py-1 text-right">Monto</th>
                      <th className="px-2 py-1 text-left">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.n} className="border-t border-black-100">
                        <td className="px-2 py-1">{f.n}</td>
                        <td className="px-2 py-1">
                          {f.titular}{" "}
                          <span className="text-xs text-black-400">
                            · {f.clabe.slice(-4)} · {f.idNumero}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {f.error ? "—" : formatMoney(f.monto)}
                        </td>
                        <td className="px-2 py-1">
                          {f.error ? (
                            <span className="text-xs text-danger-600">{f.error}</span>
                          ) : f.destinatario ? (
                            <Badge tone={VERIFICACION[f.destinatario.verificacion].tone}>
                              {VERIFICACION[f.destinatario.verificacion].label}
                            </Badge>
                          ) : (
                            <Badge tone="neutral">Nuevo</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="lote-origen">Desde</Label>
                  <select
                    id="lote-origen"
                    className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-card text-sm"
                    value={sub?.id ?? ""}
                    onChange={(e) => setOrigen(e.target.value)}
                  >
                    {pesos.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre} · {formatMoney(s.saldoDisponible)}
                      </option>
                    ))}
                  </select>
                </div>
                {codigo !== null && (
                  <div>
                    <Label htmlFor="lote-codigo">Código que te enviamos por correo</Label>
                    <Input
                      id="lote-codigo"
                      className="mt-1"
                      inputMode="numeric"
                      maxLength={6}
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-black-400">
                  {filas.length} pagos · {formatMoney(total)}
                  {conError > 0 && ` · ${conError} con error (corrige el archivo)`}
                </p>
                <div className="flex gap-2">
                  {nuevas.length > 0 && (
                    <BtnOutline onClick={registrar} disabled={registrando}>
                      {registrando ? "Registrando…" : `Registrar ${nuevas.length} destinatarios`}
                    </BtnOutline>
                  )}
                  <BtnPrimary onClick={enviar} disabled={!listas || m.lote.isPending}>
                    {m.lote.isPending ? "Enviando…" : "Enviar lote"}
                  </BtnPrimary>
                </div>
              </div>
            </>
          )}
        </>
      )}
      {lotes.length > 0 && (
        <ul className="mt-4 divide-y divide-black-100 text-sm">
          {lotes.map((l) => (
            <li key={l.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <span>
                {l.cantidad} pagos · {formatMoney(l.total)}{" "}
                <span className="text-xs text-black-400">{formatDateTime(l.creadoAt)}</span>
                {l.motivo && <span className="block text-xs text-danger-600">{l.motivo}</span>}
              </span>
              <Badge tone={ESTADO_LOTE[l.estado]?.tone ?? "neutral"}>
                {ESTADO_LOTE[l.estado]?.label ?? l.estado}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
