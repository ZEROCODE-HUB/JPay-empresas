export function Eyebrow({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "accent" | "light";
}) {
  const color =
    tone === "accent"
      ? "var(--brand-primary-500)"
      : tone === "light"
        ? "rgba(255,255,255,0.7)"
        : "#909090";
  return (
    <div
      className="font-sans text-[0.72rem] tracking-[0.14em] uppercase font-medium"
      style={{ color }}
    >
      {children}
    </div>
  );
}

export function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`transition-all duration-300 hover:-translate-y-0.5 bg-white border border-black-100 rounded-md shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
