// Catálogo de medios de pago y tipos de links de pago. Los datos reales viven en Supabase.

export interface Product {
  id: string;
  name: string;
  qty: number;
  price: number;
  desc?: string;
}

export interface PaymentMethod {
  id: string;
  label: string;
  category: "credit" | "debit";
  enabled: boolean;
}

export interface PaymentLink {
  id: string;
  url: string;
  products: Product[];
  status: "Activo" | "Inactivo" | "Vencido";
  partialPayments: boolean;
  methods: string[];
  reference?: string;
  notes?: string;
  createdAt: string;
  expiresAt?: string;
  views: number;
  payments: number;
  comercioId?: string;
  comercioNombre?: string;
}

export const paymentMethods: PaymentMethod[] = [
  { id: "visa-cred", label: "Visa Crédito", category: "credit", enabled: true },
  { id: "mc-cred", label: "Mastercard Crédito", category: "credit", enabled: true },
  { id: "amex", label: "American Express", category: "credit", enabled: true },
  { id: "cabal-cred", label: "Cabal Crédito", category: "credit", enabled: true },
  { id: "naranja", label: "Naranja X", category: "credit", enabled: true },
  { id: "diners", label: "Diners Club", category: "credit", enabled: false },
  { id: "visa-deb", label: "Visa Débito", category: "debit", enabled: true },
  { id: "mc-deb", label: "Mastercard Débito", category: "debit", enabled: true },
  { id: "cabal-deb", label: "Cabal Débito", category: "debit", enabled: true },
  { id: "maestro", label: "Maestro", category: "debit", enabled: true },
];

export function formatARS(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(n);
}
