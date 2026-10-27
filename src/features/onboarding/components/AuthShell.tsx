import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { brand, mailto } from "@/brand/brand";

export function AuthShell({
  children,
  leftEyebrow = `${brand.name} · Onboarding`,
  leftTitle = "Tus datos están protegidos bajo normativa BCRA",
  leftBody,
  step,
}: {
  children: ReactNode;
  leftEyebrow?: string;
  leftTitle?: string;
  leftBody?: string;
  step?: string;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 overflow-x-hidden bg-background">
      <aside className="relative hidden lg:flex flex-col justify-between p-10 xl:p-12 overflow-hidden select-none text-white">
        <div className="absolute inset-0">
          <img
            src={brand.assets.loginHero}
            alt=""
            aria-hidden
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/85 via-black/70 to-black/50" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />
        </div>

        <div className="relative z-10">
          <Link to="/" className="inline-flex">
            <BrandLogo variant="light" />
          </Link>
          <div className="mt-12">
            <div className="flex items-center gap-2 mb-6">
              <span className="w-6 h-px bg-primary-400/60" />
              <span className="font-sans text-[0.65rem] tracking-[0.25em] uppercase text-primary-400/80">
                {leftEyebrow}
              </span>
            </div>
            <h2 className="text-[clamp(1.5rem,2vw,2rem)] font-light leading-[1.12] tracking-tight max-w-[22ch] text-white">
              {leftTitle}
            </h2>
            {leftBody && (
              <p className="mt-5 max-w-[34ch] text-white/65 leading-relaxed text-sm">{leftBody}</p>
            )}
          </div>
        </div>

        <div className="relative z-10 space-y-5">
          <div className="inline-flex items-center gap-2.5 px-3 py-2 border border-primary-400/30 rounded-sm bg-primary-500/5 backdrop-blur">
            <ShieldCheck size={13} strokeWidth={1.5} className="text-primary-400" />
            <span className="font-sans text-[0.65rem] tracking-[0.1em] uppercase text-primary-400">
              Registrado ante BCRA
            </span>
          </div>
          {step && (
            <p className="text-white/45 font-sans text-[0.65rem] tracking-[0.15em] uppercase">
              {step}
            </p>
          )}
          <p className="text-white/35 text-[11px]">
            © {new Date().getFullYear()} {brand.name}
          </p>
        </div>
      </aside>

      <main className="flex flex-col">
        <div className="lg:hidden px-6 py-4 flex items-center justify-between bg-black text-white">
          <Link to="/" className="inline-flex items-center gap-2">
            <BrandLogo variant="light" />
          </Link>
        </div>

        <div className="flex-1 flex items-start lg:items-center justify-center px-5 sm:px-8 py-8 lg:py-16 overflow-x-hidden">
          <div className="w-full max-w-[480px]">{children}</div>
        </div>

        <footer className="px-6 py-4 text-center text-xs text-black-400">
          ¿Necesitás ayuda?{" "}
          <a
            href={mailto(brand.contact.support)}
            className="underline underline-offset-2 hover:text-primary-ink transition-colors"
          >
            {brand.contact.support}
          </a>
        </footer>
      </main>
    </div>
  );
}
