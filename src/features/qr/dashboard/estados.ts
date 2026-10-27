export const PALETTE = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#dc2626",
  "#d97706",
  "#0891b2",
  "#4f46e5",
  "#9333ea",
  "#16a34a",
  "#ca8a04",
];
export const STATUS_COLOR: Record<string, string> = {
  Aprobado: "#22c55e",
  Pendiente: "#f59e0b",
  Rechazado: "#ef4444",
  Reembolsado: "#a855f7",
};

export const statusColor = (name: string, i: number) =>
  STATUS_COLOR[name] ?? PALETTE[i % PALETTE.length];

export const pdvColor = (name: string) =>
  name === "Activado" ? "#22c55e" : name === "Desactivado" ? "#f59e0b" : PALETTE[2];
