import { ArrowRight } from "lucide-react";
import { brand } from "@/brand/brand";
import { Eyebrow } from "./primitivos";

function DashboardMockup() {
  return (
    <div className="bg-white/5 backdrop-blur-[20px] border border-white/10 rounded-xl p-1 shadow-2xl hero-dashboard-float">
      <img
        src={brand.assets.landingDashboard}
        alt={`Panel de control ${brand.name}`}
        className="block w-full h-auto rounded-lg"
      />
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative isolation -mt-16 md:-mt-20">
      <div className="hero-kenburns">
        <div
          className="hero-bg-float"
          style={{ backgroundImage: `url(${brand.assets.landingHero})` }}
          aria-hidden
        />
      </div>
      <div aria-hidden className="absolute inset-0 bg-black/55 pointer-events-none" />
      <div
        aria-hidden
        className="hero-vignette absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.05),rgba(0,0,0,0.4))] pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute -top-[15%] right-[5%] w-[500px] h-[500px] rounded-full bg-primary-500/10 blur-[60px] pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute -bottom-[10%] -left-[5%] w-[400px] h-[400px] rounded-full bg-secondary-500/10 blur-[60px] pointer-events-none"
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 flex flex-col justify-center min-h-[80vh] md:min-h-[90vh] pt-24 md:pt-40 pb-16 sm:pb-20 lg:pb-24">
        <div className="grid lg:grid-cols-2 lg:gap-14 items-center">
          <div>
            <Eyebrow tone="light">{brand.name} — Plataforma financiera digital</Eyebrow>
            <h1 className="font-bold text-[clamp(2rem,4vw,3.5rem)] leading-[1.05] mt-6 max-w-[26ch] text-white">
              Soluciones financieras para todos
            </h1>
            <p className="mt-6 max-w-lg text-white/70 text-base leading-relaxed">
              Integramos en una sola plataforma servicios de pagos y cobros para individuos, PyMEs y
              empresas.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#servicios"
                className="inline-flex h-12 items-center gap-2 px-7 rounded-sm text-sm font-medium text-primary-foreground bg-primary-500 hover:bg-primary-400 transition-colors"
              >
                Conocé más <ArrowRight size={16} />
              </a>
              <a
                href="#contacto"
                className="inline-flex h-12 items-center px-7 rounded-sm text-sm font-medium text-white border border-white/40 hover:bg-white/10 transition-colors"
              >
                Contactanos
              </a>
            </div>
          </div>
          <div className="hidden lg:block">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
