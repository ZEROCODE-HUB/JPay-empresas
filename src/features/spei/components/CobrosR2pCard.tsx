import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge, BtnPrimary, Card, Input, Label } from "@/components/portal-shell";
import { useCobrosR2p } from "@/hooks/useCobre";
import type { CobroR2p, SubcuentaSpei } from "@/lib/api/cobre";
import { formatDateTime, formatMoney, parseMonto } from "@/shared/format";
import { validarCurp, validarRfc } from "@/shared/validadores";

const ESTADO: Record<
  CobroR2p["estado"],
  { label: string; tone: "success" | "warn" | "danger" | "neutral" }
> = {
  creando: { label: "Generando CLABE", tone: "warn" },
  pendiente: { label: "Esperando el pago", tone: "warn" },
  pagado: { label: "Pagado", tone: "success" },
  vencido: { label: "Vencido", tone: "neutral" },
  rechazado: { label: "Rechazado", tone: "danger" },
  fallido: { label: "Con error", tone: "danger" },
  error_envio: { label: "No generado", tone: "danger" },
};

const VIGENCIAS = [
  { minutos: 30, label: "30 minutos" },
  { minutos: 60, label: "1 hora" },
  { minutos: 60 * 24, label: "1 día" },
  { minutos: 60 * 24 * 3, label: "3 días" },
];

const copiar = (v: string) =>
  navigator.clipboard.writeText(v).then(
    () => toast.success("CLABE copiada"),
    () => toast.error("No se pudo copiar"),
  );

/**
 * Cobro por SPEI con CLABE dinámica (Direct Link R2P de Cobre): una CLABE de un solo uso, por un
 * monto y con vencimiento, para compartir con quien paga. Al pagar, el dinero entra al Cobre
 * Balance del comercio y se acredita en la subcuenta elegida.
 */
export function CobrosR2pCard({
  subcuentas,
  habilitada,
}: {
  subcuentas: SubcuentaSpei[];
  habilitada: boolean;
}) {
  const { cobros, crear } = useCobrosR2p();
  const pesos = subcuentas.filter((s) => s.moneda === "MXN");
  const [f, setF] = useState({
    monto: "",
    concepto: "",
    nombre: "",
    id: "",
    correo: "",
    minutos: 60,
    subcuenta: "",
  });

  const generar = () => {
    const monto = parseMonto(f.monto);
    const id = f.id.trim().toUpperCase();
    if (!(monto > 0)) return toast.error("Ingresá un monto");
    if (!f.nombre.trim()) return toast.error("Falta el nombre de quien paga");
    const err = id.length === 18 ? validarCurp(id) : validarRfc(id);
    if (err) return toast.error(`RFC o CURP de quien paga: ${err}`);
    crear.mutate(
      {
        monto,
        concepto: f.concepto.trim() || "Cobro",
        minutos: f.minutos,
        subcuentaId: f.subcuenta || undefined,
        pagador: { nombre: f.nombre.trim(), id_numero: id, correo: f.correo.trim() || undefined },
      },
      {
        onSuccess: (r) => {
          toast.success(r.aviso ?? "CLABE generada: compartila con quien paga");
          setF({ ...f, monto: "", concepto: "", nombre: "", id: "", correo: "" });
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold">Nuevo cobro por SPEI</h2>
        {!habilitada ? (
          <p className="mt-2 text-sm text-black-400">
            Vas a poder cobrar cuando tu cuenta en Cobre esté activa.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="r2p-monto">Monto</Label>
              <Input
                id="r2p-monto"
                className="mt-1"
                inputMode="decimal"
                value={f.monto}
                onChange={(e) => setF({ ...f, monto: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="r2p-concepto">Concepto</Label>
              <Input
                id="r2p-concepto"
                className="mt-1"
                maxLength={120}
                value={f.concepto}
                onChange={(e) => setF({ ...f, concepto: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="r2p-nombre">Quién paga</Label>
              <Input
                id="r2p-nombre"
                className="mt-1"
                placeholder="Nombre o razón social"
                value={f.nombre}
                onChange={(e) => setF({ ...f, nombre: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="r2p-id">RFC o CURP de quien paga</Label>
              <Input
                id="r2p-id"
                className="mt-1"
                value={f.id}
                onChange={(e) => setF({ ...f, id: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="r2p-correo">Correo (opcional)</Label>
              <Input
                id="r2p-correo"
                className="mt-1"
                type="email"
                value={f.correo}
                onChange={(e) => setF({ ...f, correo: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="r2p-vence">Vence en</Label>
                <select
                  id="r2p-vence"
                  className="mt-1 w-full h-10 px-2 rounded-md border border-input bg-card text-sm"
                  value={f.minutos}
                  onChange={(e) => setF({ ...f, minutos: Number(e.target.value) })}
                >
                  {VIGENCIAS.map((v) => (
                    <option key={v.minutos} value={v.minutos}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="r2p-sub">Acreditar en</Label>
                <select
                  id="r2p-sub"
                  className="mt-1 w-full h-10 px-2 rounded-md border border-input bg-card text-sm"
                  value={f.subcuenta}
                  onChange={(e) => setF({ ...f, subcuenta: e.target.value })}
                >
                  <option value="">La de tu CLABE</option>
                  {pesos.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <BtnPrimary onClick={generar} disabled={crear.isPending}>
                {crear.isPending ? "Generando…" : "Generar CLABE de cobro"}
              </BtnPrimary>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Cobros</h2>
        {cobros.isLoading ? (
          <p className="mt-2 text-sm text-black-400">Cargando…</p>
        ) : (cobros.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-black-400">Todavía no generaste cobros.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black-100 text-sm">
            {cobros.data!.map((c) => (
              <li key={c.id} className="py-2.5 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {c.pagador}{" "}
                    {c.linkId && <span className="text-xs text-black-400">· link de pago</span>}
                  </div>
                  <div className="text-xs text-black-400">
                    {c.concepto} · {formatDateTime(c.creadoAt)}
                    {c.estado === "pendiente" && ` · vence ${formatDateTime(c.validoHasta)}`}
                    {c.pagadoAt && ` · pagado ${formatDateTime(c.pagadoAt)}`}
                  </div>
                  {c.clabe && c.estado === "pendiente" && (
                    <button
                      type="button"
                      className="mt-1 inline-flex items-center gap-2 font-mono hover:text-secondary"
                      onClick={() => copiar(c.clabe!)}
                    >
                      {c.clabe} <Copy size={13} />
                    </button>
                  )}
                  {c.motivo && c.estado !== "pagado" && (
                    <p className="text-xs text-danger-600">{c.motivo}</p>
                  )}
                </div>
                <div className="text-right">
                  <div className="tabular-nums">{formatMoney(c.monto)}</div>
                  <Badge tone={ESTADO[c.estado].tone}>{ESTADO[c.estado].label}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
