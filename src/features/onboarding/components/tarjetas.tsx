import type { ReactNode } from "react";
import { Check, Loader2, X } from "lucide-react";

/** Modo demo (sin Resend): muestra en pantalla el link de verificación que iría por correo. */
export function DemoVerifyBox({ url }: { url: string }) {
  return (
    <div className="mt-4 rounded-md border border-highlight-300 bg-highlight-50 p-4 text-left">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-black-800">Modo demo</p>
      <p className="mt-1 text-xs text-black-500">
        El envío de correos todavía no está configurado. Validá tu cuenta desde acá:
      </p>
      <a
        href={url}
        className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-sm bg-primary-500 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-400"
      >
        Validar mi correo
      </a>
    </div>
  );
}

export function SuccessCard({
  title,
  body,
  children,
  variant = "success",
}: {
  title: string;
  body?: ReactNode;
  children?: ReactNode;
  variant?: "success" | "info" | "error" | "loading";
}) {
  const color =
    variant === "success"
      ? "var(--success)"
      : variant === "error"
        ? "#DC2626"
        : "var(--brand-secondary-500)";
  const Icon = variant === "error" ? X : variant === "loading" ? Loader2 : Check;
  return (
    <div className="bg-white p-8 sm:p-10 text-center rounded-md border border-black-100">
      <div
        className="mx-auto mb-6 inline-flex items-center justify-center w-16 h-16 rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`, color }}
      >
        <Icon
          size={30}
          strokeWidth={2.5}
          className={variant === "loading" ? "animate-spin" : undefined}
        />
      </div>
      <h1 className="text-[1.75rem] font-semibold text-black-800 leading-tight">{title}</h1>
      {body && <div className="mt-4 text-sm text-black-400 leading-relaxed">{body}</div>}
      {children && <div className="mt-8 space-y-3">{children}</div>}
    </div>
  );
}

/* ============ Empty table row ============ */

export function EmptyRow({
  colSpan = 12,
  message = "No hay información disponible",
}: {
  colSpan?: number;
  message?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-black-500 bg-white">
        {message}
      </td>
    </tr>
  );
}
