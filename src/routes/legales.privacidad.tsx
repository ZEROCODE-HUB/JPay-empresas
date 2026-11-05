import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { brand, pageTitle } from "@/brand/brand";

export const Route = createFileRoute("/legales/privacidad")({
  head: () => ({
    meta: [
      { title: pageTitle("Aviso de privacidad") },
      { name: "description", content: "Aviso de privacidad y tratamiento de datos personales." },
    ],
  }),
  component: Page,
});

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
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Aviso de privacidad</h1>

        <section className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              1. Responsable del tratamiento
            </h2>
            <p>
              {brand.company.legalName}, {brand.company.taxIdType} {brand.company.taxId}, con
              domicilio en {brand.company.address}, es la responsable del tratamiento de los datos
              personales.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">2. Datos recolectados</h2>
            <p>
              Recabamos datos de identificación de la empresa y de sus representantes, datos
              operativos de la cuenta y datos de navegación con fines de seguridad y prevención de
              fraude.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">3. Finalidad</h2>
            <p>
              Los datos se utilizan para prestar el servicio, cumplir las obligaciones de prevención
              de lavado de dinero (PLD) y enviar comunicaciones vinculadas al servicio.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">4. Derechos ARCO</h2>
            <p>
              Conforme a la legislación mexicana de protección de datos personales en posesión de
              los particulares, el titular puede ejercer sus derechos de acceso, rectificación,
              cancelación y oposición (ARCO) escribiendo a {brand.contact.privacy}.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">5. Autoridad competente</h2>
            <p>
              Si consideras que tu derecho a la protección de datos personales fue vulnerado, puedes
              acudir a la autoridad competente en la materia.
            </p>
          </div>
        </section>
      </article>
    </div>
  );
}
