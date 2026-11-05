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
        </div>
        <div>
          <div className="font-sans text-[0.65rem] tracking-[0.14em] uppercase text-primary-400">
            Enlaces útiles
          </div>
          <ul className="mt-5 space-y-3 font-sans text-sm text-white/70">
            <li>
              <Link to="/legales/privacidad" className="hover:text-white transition-colors">
                Aviso de privacidad
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
                Solicitud de cancelación
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="font-sans text-[0.65rem] tracking-[0.14em] uppercase text-primary-400">
            Contáctanos
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
            Usuarios financieros
          </div>
          <div className="mt-5 border border-white/10 p-4 bg-black-800">
            <div className="font-sans text-[0.6rem] tracking-[0.14em] uppercase text-primary-400">
              CONDUSEF
            </div>
            <div className="mt-1.5 font-sans text-sm text-white/80 leading-relaxed">
              Protección y defensa de los usuarios de servicios financieros
            </div>
            <a
              href="https://www.condusef.gob.mx"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block font-sans text-[0.6rem] tracking-[0.14em] uppercase text-white hover:text-primary-400 transition-colors"
            >
              condusef.gob.mx →
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-col md:flex-row gap-3 md:items-center md:justify-between font-sans text-[0.7rem] text-white/40">
          <div>
            {brand.name.toUpperCase()} — {brand.company.taxIdType} {brand.company.taxId}
          </div>
        </div>
      </div>
    </footer>
  );
}
