import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, BtnOutline, Card, PageHeader } from "@/components/portal-shell";
import { useComerciosCliente } from "@/hooks/useComercios";
import { useConexionEcartPay, useRetirosEcartPay } from "@/hooks/useIntegraciones";
import { formatDateTime, formatMoney } from "@/shared/format";
import { KpiCard } from "@/shared/ui/kpi-card";

export const Route = createFileRoute("/app/retiros")({
  head: () => ({ meta: [{ title: "Retiros" }] }),
  component: Page,
});

const ESTADO: Record<string, { label: string; tone: "success" | "warn" | "danger" | "neutral" }> = {
  paid: { label: "Depositado", tone: "success" },
  processing: { label: "En proceso", tone: "warn" },
  pending: { label: "Pendiente", tone: "warn" },
  failed: { label: "Fallido", tone: "danger" },
  rejected: { label: "Rechazado", tone: "danger" },
  canceled: { label: "Cancelado", tone: "neutral" },
};
const TIPO_CUENTA: Record<string, string> = { clabe: "CLABE", tarjeta: "Tarjeta de débito" };

function Page() {
  const { rows, isLoading: cargandoComercios } = useComerciosCliente();
  const comercioId = rows?.[0]?.id ?? null;
  const conexion = useConexionEcartPay(comercioId);
  const conectado = conexion.data?.estado === "conectado";
  const [pagina, setPagina] = useState(1);
  const { data, isLoading, isFetching, error } = useRetirosEcartPay(pagina, conectado);
  const cuentas = new Map((data?.cuentas ?? []).map((c) => [c.id, c]));

  return (
    <>
      <PageHeader
        title="Retiros"
        description="Lo que pasaste de tu cuenta de Ecart Pay a tu banco. Los retiros se piden desde el panel de Ecart Pay."
      />
      {cargandoComercios || conexion.isLoading ? (
        <Card className="text-sm text-black-400">Cargando…</Card>
      ) : !conectado ? (
        <Card className="text-sm">
          Para ver tus retiros primero conectá tu cuenta de Ecart Pay en{" "}
          <Link to="/app/integraciones" className="font-semibold text-secondary hover:underline">
            Integraciones
          </Link>
          .
        </Card>
      ) : isLoading ? (
        <Card className="text-sm text-black-400">Consultando Ecart Pay…</Card>
      ) : error ? (
        <Card className="text-sm text-danger-600">
          No se pudieron consultar los retiros: {(error as Error).message}
        </Card>
      ) : data ? (
        <div className="space-y-4">
          {data.errores.length > 0 && (
            <Card className="text-xs text-warning">
              Ecart Pay no devolvió parte de la información ({data.errores.join(" · ")}).
            </Card>
          )}
          {data.saldo && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KpiCard label="Disponible en Ecart Pay" value={formatMoney(data.saldo.disponible)} />
              <KpiCard label="Cobrado" value={formatMoney(data.saldo.cobrado)} />
              <KpiCard
                label="Retiros, reembolsos y comisiones"
                value={formatMoney(data.saldo.cargos)}
              />
            </div>
          )}

          <Card>
            <h2 className="font-semibold">Cuentas de retiro</h2>
            {data.cuentas.length === 0 ? (
              <p className="mt-2 text-sm text-black-400">
                No tenés cuentas de retiro cargadas. Agregá tu CLABE en el panel de Ecart Pay.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-black-100 text-sm">
                {data.cuentas.map((c) => (
                  <li key={c.id} className="py-2 flex flex-wrap justify-between gap-2">
                    <span>
                      <span className="font-medium">
                        {c.nombre ?? TIPO_CUENTA[c.tipo] ?? c.tipo}
                      </span>
                      {c.titular && <span className="text-black-400"> · {c.titular}</span>}
                    </span>
                    <span className="text-black-400 tabular-nums">
                      {TIPO_CUENTA[c.tipo] ?? c.tipo} {c.numero ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-semibold">Historial de retiros</h2>
            {data.retiros.length === 0 ? (
              <p className="mt-2 text-sm text-black-400">Todavía no hiciste retiros.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-black-400 text-left">
                    <tr>
                      <th className="py-2 pr-4">Fecha</th>
                      <th className="py-2 pr-4">Cuenta</th>
                      <th className="py-2 pr-4">Referencia</th>
                      <th className="py-2 pr-4 text-right">Monto</th>
                      <th className="py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.retiros.map((r) => {
                      const e = ESTADO[r.estado] ?? { label: r.estado, tone: "neutral" as const };
                      const cuenta = r.cuentaId ? cuentas.get(r.cuentaId) : undefined;
                      return (
                        <tr key={r.id} className="border-t border-black-100">
                          <td className="py-2 pr-4 text-xs whitespace-nowrap">
                            {formatDateTime(r.creadoAt)}
                          </td>
                          <td className="py-2 pr-4">
                            {cuenta ? `${cuenta.nombre ?? ""} ${cuenta.numero ?? ""}`.trim() : "—"}
                          </td>
                          <td className="py-2 pr-4 text-xs">{r.transaccionId ?? "—"}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {formatMoney(r.monto)}
                            {r.comision > 0 && (
                              <span className="block text-xs text-black-400">
                                Comisión {formatMoney(r.comision)}
                              </span>
                            )}
                          </td>
                          <td className="py-2">
                            <Badge tone={e.tone}>{e.label}</Badge>
                            {r.enRevision && (
                              <span className="block text-[11px] text-black-400 mt-0.5">
                                En revisión por Ecart Pay
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {data.paginas > 1 && (
              <div className="mt-3 flex items-center justify-end gap-2 text-xs">
                <BtnOutline
                  disabled={pagina <= 1 || isFetching}
                  onClick={() => setPagina(pagina - 1)}
                >
                  Anterior
                </BtnOutline>
                <span>
                  Página {data.pagina} de {data.paginas}
                </span>
                <BtnOutline
                  disabled={pagina >= data.paginas || isFetching}
                  onClick={() => setPagina(pagina + 1)}
                >
                  Siguiente
                </BtnOutline>
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </>
  );
}
