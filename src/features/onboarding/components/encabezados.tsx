import { Check } from "lucide-react";

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2 shrink-0">
            <span
              className={`inline-flex items-center justify-center w-7 h-7 text-xs font-semibold rounded-full ${
                done
                  ? "bg-success text-white"
                  : active
                    ? "bg-primary-500 text-primary-foreground"
                    : "bg-transparent text-black-600 border border-black-200"
              }`}
            >
              {done ? <Check size={14} /> : i + 1}
            </span>
            <span
              className={`text-xs ${active ? "font-semibold text-black-800" : "text-black-400"}`}
            >
              {label}
            </span>
            {i < steps.length - 1 && <span className="w-6 h-px bg-black-100" />}
          </li>
        );
      })}
    </ol>
  );
}

export function FormTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-7">
      {eyebrow && (
        <p className="mb-2 font-sans text-[0.7rem] tracking-[0.2em] uppercase text-primary-ink">
          {eyebrow}
        </p>
      )}
      <h1 className="text-[clamp(1.5rem,2.4vw,1.9rem)] font-semibold leading-[1.15] text-black-800">
        {title}
      </h1>
      {subtitle && <p className="mt-3 text-sm text-black-400 leading-relaxed">{subtitle}</p>}
    </div>
  );
}
