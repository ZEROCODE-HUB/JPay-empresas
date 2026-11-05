import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { brand, pageTitle } from "@/brand/brand";

export const Route = createFileRoute("/legales/comisiones")({
  head: () => ({
    meta: [
      { title: pageTitle("Tabla de comisiones") },
      {
        name: "description",
        content: "Conceptos por los que la plataforma cobra comisión.",
      },
    ],
  }),
  component: Page,
});

// Conceptos que cobra la plataforma. Los montos dependen del contrato de cada empresa, así que
// aquí no se publican cifras.
const conceptos = [
  `Transferencias entre cuentas ${brand.name}`,
  "Transferencias SPEI",
  "Cobros con link de pago (tarjeta, OXXO y SPEI)",
  "Suscripciones y domiciliación",
  "Cobros masivos por lote",
  "Pagos en dólares (Fedwire y SWIFT)",
  "Pago de servicios",
];

function Page() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <BrandLogo />
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft size={14} /> Volver al inicio
          </Link>
        </div>
      </header>
      <article className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Tabla de comisiones</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Consulta las comisiones vigentes con tu ejecutivo: dependen del contrato de tu empresa.
        </p>

        <div className="mt-8 border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Concepto</th>
                <th className="text-right px-4 py-3">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {conceptos.map((c) => (
                <tr key={c} className="border-t">
                  <td className="px-4 py-3">{c}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                    Según contrato
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Las comisiones se expresan en pesos mexicanos (MXN), salvo las operaciones en dólares. El
          IVA se indica por separado.
        </p>
      </article>
    </div>
  );
}
