import { useState, type InputHTMLAttributes } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { PASSWORD_RULES } from "../utils";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export function Field({ label, error, hint, className = "", ...rest }: FieldProps) {
  return (
    <label className="block">
      <span className="block mb-1.5 text-xs font-semibold text-black-700">{label}</span>
      <input
        {...rest}
        className={`w-full h-11 px-3 bg-white text-sm text-black-700 outline-none transition-colors rounded-sm ${
          error ? "border-danger-500" : "border-black-100"
        } border focus:border-secondary-500 focus:ring-2 focus:ring-secondary-100 placeholder:text-black-300 ${className}`}
      />
      {error ? (
        <span className="mt-1 block text-xs text-danger-500">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-black-400">{hint}</span>
      ) : null}
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  error,
  placeholder = "Seleccioná…",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Texto (valor = etiqueta) o pares valor/etiqueta. */
  options: Array<string | { value: string; label: string }>;
  error?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block mb-1.5 text-xs font-semibold text-black-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full h-11 px-3 bg-white text-sm outline-none rounded-sm ${
          error ? "border-danger-500" : "border-black-100"
        } border focus:border-secondary-500 focus:ring-2 focus:ring-secondary-100 ${
          value ? "text-black-800 font-medium" : "text-black-500"
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => {
          const { value: v, label: l } = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
      {error && <span className="mt-1 block text-xs text-danger-500">{error}</span>}
    </label>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  showRules = false,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  showRules?: boolean;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block">
        <span className="block mb-1.5 text-xs font-semibold text-black-700">{label}</span>
        <div
          className={`flex items-center bg-white rounded-sm border ${
            error ? "border-danger-500" : "border-black-100"
          } focus-within:border-secondary-500 focus-within:ring-2 focus-within:ring-secondary-100`}
        >
          <input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 h-11 px-3 bg-transparent text-sm outline-none text-black-700 placeholder:text-black-300"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="px-3 text-black-400 hover:text-black-700"
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {error && <span className="mt-1 block text-xs text-danger-500">{error}</span>}
      </label>
      {showRules && (
        <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-3">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(value);
            return (
              <li
                key={r.id}
                className={`flex items-center gap-1.5 text-[11px] ${ok ? "text-success" : "text-black-400"}`}
              >
                <Check size={12} />
                {r.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
