import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";
import { brand, copyright, mailto } from "@/brand/brand";

export function SiteFooter() {
  return (
    <footer id="contacto" className="bg-black text-white border-t border-white/10">
      <div className="max-w-6xl mx-auto px-6 py-20 grid gap-12 md:grid-cols-4">
        <div className="md:col-span-1">
          <BrandLogo variant="light" />
          <p className="mt-6 text-sm text-white/50 leading-relaxed max-w-[260px]">
            {copyright().replace(brand.name, brand.name.toUpperCase())}
          </p>
          <p className="mt-4 font-sans text-[0.65rem] tracking-[0.14em] uppercase text-primary-400">
            PSPCP · Marco BCRA
          </p>
        </div>
        <div>
          <div className="font-sans text-[0.65rem] tracking-[0.14em] uppercase text-primary-400">
            Enlaces útiles
          </div>
          <ul className="mt-5 space-y-3 font-sans text-sm text-white/70">
            <li>
              <Link to="/legales/privacidad" className="hover:text-white transition-colors">
                Políticas de privacidad
              </Link>
            </li>
            <li>
              <Link to="/legales/terminos" className="hover:text-white transition-colors">
                Términos y condiciones
              </Link>
            </li>
            <li>
              <Link to="/legales/comisiones" className="hover:text-white transition-colors">
                Comisiones
              </Link>
            </li>
            <li>
              <Link to="/legales/arrepentimiento" className="hover:text-white transition-colors">
                Botón de arrepentimiento
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="font-sans text-[0.65rem] tracking-[0.14em] uppercase text-primary-400">
            Contactanos
          </div>
          <ul className="mt-5 space-y-3 font-sans text-sm text-white/70">
            <li>
              <a
                href={mailto(brand.contact.general)}
                className="hover:text-white transition-colors"
              >
                {brand.contact.general}
              </a>
            </li>
            <li>
              <a href={mailto(brand.contact.admin)} className="hover:text-white transition-colors">
                {brand.contact.admin}
              </a>
            </li>
            <li>
              <a href={mailto(brand.contact.claims)} className="hover:text-white transition-colors">
                {brand.contact.claims}
              </a>
            </li>
          </ul>
        </div>
        <div>
          <div className="font-sans text-[0.65rem] tracking-[0.14em] uppercase text-primary-400">
            Ente fiscalizador
          </div>
          <div className="mt-5 border border-white/10 p-4 bg-black-800">
            <div className="font-sans text-[0.6rem] tracking-[0.14em] uppercase text-primary-400">
              BCRA
            </div>
            <div className="mt-1.5 font-sans text-sm text-white/80 leading-relaxed">
              Banco Central de la República Argentina
            </div>
            <a
              href="https://www.bcra.gob.ar"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block font-sans text-[0.6rem] tracking-[0.14em] uppercase text-white hover:text-primary-400 transition-colors"
            >
              bcra.gob.ar →
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-col md:flex-row gap-3 md:items-center md:justify-between font-sans text-[0.7rem] text-white/40">
          <div>
            {brand.name.toUpperCase()} — CUIT {brand.company.cuit}
          </div>
          <div>
            Los fondos depositados no constituyen depósitos en una entidad financiera ni cuentan con
            la garantía de la Ley 24.485.
          </div>
        </div>
      </div>
    </footer>
  );
}
