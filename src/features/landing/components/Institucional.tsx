import { Compass, HeartHandshake, Lock, Plane, Target } from "lucide-react";
import { Eyebrow } from "./primitivos";

export function MisionVision() {
  return (
    <section className="relative overflow-hidden bg-black text-white">
      <div
        aria-hidden
        className="absolute -top-[10%] left-[40%] w-[600px] h-[600px] rounded-full bg-primary-500/5 blur-[40px] pointer-events-none"
      />
      <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-32">
        <div className="grid md:grid-cols-2 gap-8">
          <article className="p-8 sm:p-10 bg-white/5 backdrop-blur border border-white/10 rounded-md">
            <div className="flex items-center gap-3">
              <Target size={22} strokeWidth={1.4} className="text-primary-400" />
              <span className="font-sans text-[0.65rem] tracking-[0.14em] uppercase text-primary-400">
                01 — Misión
              </span>
            </div>
            <h3 className="font-semibold text-[clamp(1.75rem,2.4vw,2.15rem)] leading-tight mt-5 text-white">
              Facilitar la gestión digital de cobros y pagos.
            </h3>
            <p className="mt-6 text-white/70 text-base leading-relaxed">
              Proporcionar soluciones financieras seguras, transparentes y simples que faciliten la
              gestión de cobros y pagos para todos nuestros usuarios en un entorno digital en
              constante evolución.
            </p>
          </article>
          <article className="p-8 sm:p-10 bg-black-800 border border-primary-400/30 rounded-md">
            <div className="flex items-center gap-3">
              <Compass size={22} strokeWidth={1.4} className="text-primary-400" />
              <span className="font-sans text-[0.65rem] tracking-[0.14em] uppercase text-primary-400">
                02 — Visión
              </span>
            </div>
            <h3 className="font-semibold text-[clamp(1.75rem,2.4vw,2.15rem)] leading-tight mt-5 text-white">
              Ser un referente Fintech en la región.
            </h3>
            <p className="mt-6 text-white/70 text-base leading-relaxed">
              Posicionarnos como un referente en el sector Fintech, acompañando la evolución de
              cobros y pagos digitales con soluciones ágiles y simples.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

export function PorQueElegirnos() {
  const items = [
    {
      icon: Lock,
      t: "Tecnología Segura",
      d: "Plataforma diseñada para ser dinámica, escalable y segura, cumpliendo con todas las normativas vigentes.",
    },
    {
      icon: HeartHandshake,
      t: "Atención Personalizada",
      d: "Acompañamos a nuestros clientes con una atención cercana, atendiendo todas sus necesidades.",
    },
    {
      icon: Plane,
      t: "Alcance Internacional",
      d: "Operaciones en múltiples países de América Latina con alianzas estratégicas sólidas.",
    },
  ];
  return (
    <section className="relative bg-white border-t border-black-100">
      <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-32">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12 md:mb-16">
          <div>
            <Eyebrow tone="accent">Diferenciales</Eyebrow>
            <h2 className="font-semibold text-[clamp(2rem,3.5vw,3rem)] leading-[1.1] mt-4 text-black-800">
              ¿Por qué elegirnos?
            </h2>
          </div>
          <p className="md:max-w-sm text-sm text-black-400 leading-relaxed">
            Tres pilares que definen la forma en la que trabajamos y nos diferencian del resto del
            sector.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
          {items.map(({ icon: Icon, t, d }) => (
            <article
              key={t}
              className="group transition-all duration-300 hover:-translate-y-0.5 p-8 sm:p-9 bg-white rounded-md border border-black-100 border-t-2 border-t-primary-500"
            >
              <div className="w-[52px] h-[52px] flex items-center justify-center rounded-full bg-primary-50 border border-primary-200">
                <Icon size={22} strokeWidth={1.5} className="text-primary-ink" />
              </div>
              <h3 className="font-semibold text-[1.375rem] mt-6 text-black-800 leading-tight">
                {t}
              </h3>
              <div className="h-px bg-primary-500 w-8 my-3" />
              <p className="text-sm text-black-400 leading-relaxed">{d}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RegulatoryStrip() {
  return (
    <section className="bg-black-800 border-t border-white/10 text-white">
      <div className="max-w-6xl mx-auto px-6 py-8 md:py-10 flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
        <div className="flex items-center gap-5">
          <div className="border border-primary-400 px-3 py-1.5 font-sans text-[0.7rem] tracking-[0.14em] uppercase text-white">
            BCRA
          </div>
          <div>
            <div className="font-sans text-[0.65rem] tracking-[0.14em] uppercase text-primary-400">
              Usuarios financieros
            </div>
            <div className="mt-1 font-sans text-sm text-white/80">
              Banco Central de la República Argentina — protección al usuario financiero.
            </div>
          </div>
        </div>
        <a
          href="https://www.usuariosfinancieros.gob.ar"
          target="_blank"
          rel="noreferrer"
          className="font-sans text-sm text-white border-b border-primary-400 pb-0.5 hover:text-primary-400 transition-colors"
        >
          usuariosfinancieros.gob.ar →
        </a>
      </div>
    </section>
  );
}
