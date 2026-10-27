import {
  Wallet,
  Globe2,
  Building2,
  Smartphone,
  ShieldCheck,
  FileCheck2,
  BarChart3,
  Cog,
  Briefcase,
} from "lucide-react";
import { brand } from "@/brand/brand";
import { Eyebrow, GlassCard } from "./primitivos";

export function LedgerStrip() {
  const items = [
    ["Entidad registrada", brand.company.legalName],
    ["Cobertura", "América Latina"],
    ["Compliance", "Marco normativo BCRA"],
    ["Plataforma", "100% digital"],
  ];
  return (
    <section className="bg-black-800 border-t border-white/10 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4">
          {items.map(([label, value], i) => (
            <div
              key={label}
              className={`py-3 md:py-7 px-2 md:px-6 ${i > 0 ? "border-l border-white/10" : ""}`}
            >
              <div className="font-sans text-[0.6rem] tracking-[0.14em] uppercase text-primary-400">
                {label}
              </div>
              <div className="mt-1 md:mt-2 font-sans text-[clamp(0.7rem,2.5vw,0.875rem)] tracking-wider text-white">
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Servicios() {
  const items = [
    {
      icon: Wallet,
      t: "Cuenta de Pago",
      d: "CVU para enviar y recibir dinero de cuentas bancarias y billeteras virtuales de manera ágil y segura.",
    },
    {
      icon: Globe2,
      t: "Crossborder",
      d: "Servicios de transferencias internacionales y remesas con cobertura en América Latina.",
    },
    {
      icon: Building2,
      t: "CVU Collect",
      d: "Soluciones de recaudación para desarrolladores inmobiliarios, consorcios e inmobiliarias.",
    },
    {
      icon: Smartphone,
      t: "Billetera",
      d: "QR, tarjetas prepagas físicas y virtuales, pagos NFC y link de pago para comercios.",
    },
  ];
  return (
    <section
      id="servicios"
      className="relative overflow-hidden bg-gradient-to-b from-plata-50 to-white border-t border-black-100"
    >
      <div
        aria-hidden
        className="absolute top-[20%] -left-[8%] w-[420px] h-[420px] rounded-full bg-primary-500/5 blur-[40px] pointer-events-none"
      />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-32">
        <Eyebrow tone="accent">Servicios</Eyebrow>
        <h2 className="font-semibold text-[clamp(2rem,3.5vw,3rem)] leading-[1.1] mt-4 text-black-800">
          Nuestros servicios
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-12 md:mt-16">
          {items.map(({ icon: Icon, t, d }) => (
            <GlassCard key={t} className="flex flex-col h-full p-5 sm:p-7">
              <div className="h-px bg-primary-500 w-8 mb-6" />
              <Icon size={22} strokeWidth={1.4} className="text-black-800" />
              <h3 className="font-semibold text-[1.375rem] leading-tight mt-4 text-black-800">
                {t}
              </h3>
              <p className="mt-3 text-sm text-black-400 leading-relaxed">{d}</p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContamosCon() {
  const items = [
    {
      icon: Cog,
      t: "Plataforma Tecnológica",
      d: "Sistema escalable y seguro que garantiza el cumplimiento de normas nacionales y compliance.",
    },
    {
      icon: ShieldCheck,
      t: "Compliance Integral",
      d: "Políticas y procedimientos personalizados garantizando el cumplimiento normativo.",
    },
    {
      icon: FileCheck2,
      t: "Reporting",
      d: "Informes y declaraciones obligatorias ante autoridades competentes.",
    },
    {
      icon: BarChart3,
      t: "Administración",
      d: "Seguimiento y control de gestión de toda la actividad.",
    },
    {
      icon: Briefcase,
      t: "Management",
      d: "Acompañamiento estratégico para el crecimiento y desarrollo empresarial.",
    },
  ];
  return (
    <section
      id="nosotros"
      className="relative overflow-hidden bg-gradient-to-b from-white to-plata-50 border-t border-black-100"
    >
      <div
        aria-hidden
        className="absolute top-[10%] -right-[6%] w-[420px] h-[420px] rounded-full bg-secondary-500/5 blur-[40px] pointer-events-none"
      />
      <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-32">
        <Eyebrow tone="accent">Capacidades</Eyebrow>
        <h2 className="font-semibold text-[clamp(2rem,3.5vw,3rem)] leading-[1.1] mt-4 text-black-800">
          Contamos con
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-6 mt-12 md:mt-16">
          {items.map(({ icon: Icon, t, d }) => (
            <GlassCard key={t} className="h-full flex flex-col p-4 sm:p-5">
              <div className="w-[42px] h-[42px] flex items-center justify-center border border-primary-200 rounded-sm bg-primary-50/50">
                <Icon size={18} strokeWidth={1.5} className="text-black-800" />
              </div>
              <h3 className="mt-4 font-semibold text-base text-black-800 leading-tight">{t}</h3>
              <p className="mt-2 text-xs text-black-400 leading-relaxed">{d}</p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}
