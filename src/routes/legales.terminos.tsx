import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { brand, pageTitle } from "@/brand/brand";

export const Route = createFileRoute("/legales/terminos")({
  head: () => ({
    meta: [
      { title: pageTitle("Términos y condiciones") },
      {
        name: "description",
        content: `Términos y condiciones de uso de la plataforma ${brand.name}.`,
      },
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
      <article className="max-w-3xl mx-auto px-6 py-16 prose prose-sm">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Términos y condiciones
        </h1>

        <section className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">1. Objeto</h2>
            <p>
              {brand.company.legalName} (en adelante "{brand.company.shortName}") ofrece una
              plataforma tecnológica de pagos y cobros para empresas en México. Estos términos
              regulan el uso de la plataforma por parte de personas morales y personas físicas con
              actividad empresarial.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              2. Registro y verificación
            </h2>
            <p>
              El titular deberá completar el proceso de conocimiento del cliente (KYC/KYB) y aportar
              la documentación requerida, conforme a la normativa de prevención de lavado de dinero.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              3. Uso de la cuenta de pago
            </h2>
            <p>
              El uso de la cuenta, los límites de operación y la forma en que se resguardan los
              fondos se rigen por el contrato que la empresa firma con {brand.company.shortName}.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">4. Comisiones</h2>
            <p>
              Las comisiones aplicables se detallan en la{" "}
              <Link to="/legales/comisiones" className="text-primary-ink underline">
                Tabla de comisiones
              </Link>{" "}
              y en el contrato de cada empresa, que forman parte de estos términos.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">5. Cancelación</h2>
            <p>
              El usuario podrá solicitar la cancelación de la cuenta en cualquier momento desde la{" "}
              <Link to="/legales/arrepentimiento" className="text-primary-ink underline">
                solicitud de cancelación
              </Link>{" "}
              o comunicándose con nuestro equipo.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">6. Jurisdicción</h2>
            <p>
              Para cualquier controversia se aplicará la legislación de los Estados Unidos Mexicanos
              y serán competentes los tribunales que se indiquen en el contrato.
            </p>
          </div>
        </section>
      </article>
    </div>
  );
}
