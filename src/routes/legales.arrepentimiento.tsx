import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { brand, pageTitle } from "@/brand/brand";
import { toast } from "sonner";

export const Route = createFileRoute("/legales/arrepentimiento")({
  head: () => ({
    meta: [
      { title: pageTitle("Solicitud de cancelación") },
      {
        name: "description",
        content: "Solicita la cancelación de tu cuenta o de un servicio contratado.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const [enviado, setEnviado] = useState(false);
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
      <article className="max-w-2xl mx-auto px-6 py-16">
        <div className="w-12 h-12 rounded-lg bg-[color:var(--brand-primary-50)] text-primary-ink grid place-items-center mb-4">
          <ShieldAlert size={22} />
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Solicitud de cancelación
        </h1>
        <p className="text-sm text-muted-foreground mt-3">
          Puedes solicitar la cancelación de tu cuenta o de un servicio contratado. Las condiciones
          y los plazos aplicables son los de tu contrato y los que marca la legislación mexicana de
          protección al consumidor.
        </p>

        {!enviado ? (
          <form
            className="mt-8 border rounded-lg p-6 space-y-4 bg-card"
            onSubmit={(e) => {
              e.preventDefault();
              setEnviado(true);
              toast.success("Solicitud de cancelación enviada");
            }}
          >
            <div>
              <label className="block text-xs font-semibold mb-1">Razón social</label>
              <input
                required
                className="w-full h-10 px-3 rounded-md border bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">RFC</label>
              <input
                required
                className="w-full h-10 px-3 rounded-md border bg-background text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Email de contacto</label>
              <input
                required
                type="email"
                className="w-full h-10 px-3 rounded-md border bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Motivo (opcional)</label>
              <textarea
                rows={3}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full h-11 rounded-md bg-primary text-primary-foreground font-semibold text-sm"
            >
              Enviar solicitud de cancelación
            </button>
            <p className="text-[11px] text-muted-foreground">
              {brand.company.shortName} procesará tu solicitud dentro de las 48 horas hábiles y te
              enviará la confirmación por correo.
            </p>
          </form>
        ) : (
          <div className="mt-8 border rounded-lg p-6 bg-emerald-50 text-emerald-900 text-sm">
            Recibimos tu solicitud. Un representante se pondrá en contacto contigo dentro de las
            próximas 48 horas hábiles.
          </div>
        )}
      </article>
    </div>
  );
}
