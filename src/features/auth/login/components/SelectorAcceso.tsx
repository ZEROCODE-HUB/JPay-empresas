import type { TipoCuenta } from "@/lib/onboarding-store";

type Tab = "login" | "register";

/** Pestañas "Iniciar sesión / Crear cuenta" y, al registrarse, el tipo de persona. */
export function SelectorAcceso({
  tab,
  setTab,
  tipoCuenta,
  setTipoCuenta,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  tipoCuenta: TipoCuenta;
  setTipoCuenta: (t: TipoCuenta) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 border-b border-black-100 mb-8">
        <button
          onClick={() => setTab("login")}
          className={`pb-3 text-sm font-semibold transition-colors ${
            tab === "login" ? "border-b-2 border-primary-500 text-black-800" : "text-black-400"
          }`}
        >
          Iniciar sesión
        </button>
        <button
          onClick={() => setTab("register")}
          className={`pb-3 text-sm font-semibold transition-colors ${
            tab === "register" ? "border-b-2 border-primary-500 text-black-800" : "text-black-400"
          }`}
        >
          Crear cuenta
        </button>
      </div>

      {tab === "register" && (
        <div className="flex gap-3 mb-6">
          <button
            type="button"
            onClick={() => setTipoCuenta("fisica")}
            className={`flex-1 h-11 text-xs font-semibold tracking-wide transition-all rounded-sm ${
              tipoCuenta === "fisica"
                ? "bg-black text-white"
                : "bg-white text-black-400 border border-black-100"
            }`}
          >
            Persona Física
          </button>
          <button
            type="button"
            onClick={() => setTipoCuenta("juridica")}
            className={`flex-1 h-11 text-xs font-semibold tracking-wide transition-all rounded-sm ${
              tipoCuenta === "juridica"
                ? "bg-black text-white"
                : "bg-white text-black-400 border border-black-100"
            }`}
          >
            Persona Jurídica
          </button>
        </div>
      )}
    </>
  );
}
