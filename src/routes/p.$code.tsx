import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Loader2,
  CheckCircle2,
  Lock,
  CreditCard,
  AlertCircle,
  ShieldCheck,
  FlaskConical,
} from "lucide-react";
import { Card, BtnPrimary, Input, Label } from "@/components/portal-shell";
import { BrandLogo } from "@/components/brand-logo";
import { brand } from "@/brand/brand";
import { toast } from "sonner";
import { requireSupabase } from "@/lib/supabase";
import { paymentProcessor } from "@/lib/payment-processor";
import {
  isDevWithTestCard,
  isPaywayTestCardApproved,
  PAYWAY_TEST_CARD,
  testCardFitsMethod,
} from "@/lib/payway-test-card";
import { paymentMethods } from "@/data/links-pago";

export const Route = createFileRoute("/p/$code")({ component: Checkout });

type LinkData = {
  id: string;
  url: string;
  estado: string;
  referencia: string | null;
  notas: string | null;
  expira_en: string | null;
  pagos_parciales: boolean;
  metodos_pago: string[];
  cliente_legajo: string;
  monto: number;
  detalle: Array<{ producto_nombre: string; cantidad: number; precio_unitario: number }>;
  comercio_id: string | null;
  comercio_nombre: string | null;
};

const formatARS = (n: number) =>
  `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Fecha y hora del comprobante, en hora local de quien pago. */
const formatFechaHora = (d: Date) =>
  d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const LOTE_CATEGORY_TO_METHODS: Record<string, string[]> = {
  TARJETA_CREDITO: ["visa-cred", "mc-cred", "amex", "cabal-cred", "naranja", "diners"],
  TARJETA_DEBITO: ["visa-deb", "mc-deb", "cabal-deb", "maestro"],
  TRANSFERENCIA: ["transferencia"],
  QR: ["qr"],
};

const EXTRA_METHODS: Array<{ id: string; label: string; category: "credit" | "debit" | "other"; enabled: boolean }> = [
  { id: "transferencia", label: "Transferencia", category: "other", enabled: true },
  { id: "qr", label: "Código QR", category: "other", enabled: true },
];

/**
 * Cada bandera del comercio puede habilitar mas de un metodo visible (Visa
 * credito y Visa debito, por ejemplo). Se usa para derivar que ids de metodo
 * mostrar a partir de las banderas activas y, al simular, para encontrar el
 * UUID de la bandera que corresponde al metodo elegido.
 */
const BANDERA_TO_METHODS: Record<string, string[]> = {
  "visa": ["visa-cred", "visa-deb"],
  "visa_débito": ["visa-deb"],
  "visa_crédito": ["visa-cred"],
  "visa_prepaga": ["visa-deb"],
  "mastercard": ["mc-cred", "mc-deb"],
  "mastercard_débito": ["mc-deb"],
  "mastercard_crédito": ["mc-cred"],
  "mastercard_prepaga": ["mc-deb"],
  "amex": ["amex"],
  "american_express": ["amex"],
  "cabal": ["cabal-cred", "cabal-deb"],
  "cabal_débito": ["cabal-deb"],
  "cabal_crédito": ["cabal-cred"],
  "naranja": ["naranja"],
  "naranja_x": ["naranja"],
  "diners": ["diners"],
  "maestro": ["maestro"],
  "transferencia": ["transferencia"],
  "qr": ["qr"],
  "pago_fácil": ["transferencia"],
  "rapipago": ["transferencia"],
};

function variantsDeBandera(flag: string): string[] {
  const lower = flag.toLowerCase();
  return BANDERA_TO_METHODS[lower] || BANDERA_TO_METHODS[lower.split("_")[0]] || [lower];
}

function expandMethods(raw: string[] | null | undefined): string[] {
  if (!raw?.length) return [];
  const ids = raw.flatMap((m) => LOTE_CATEGORY_TO_METHODS[m] ?? (m ? [m] : []));
  return Array.from(new Set(ids));
}

function getMethodIdFromBandera(bandera: string): string {
  const lower = bandera.toLowerCase();
  const BANDERA_TO_METHODS: Record<string, string> = {
    "visa": "visa-cred",
    "visa_débito": "visa-deb",
    "visa_crédito": "visa-cred",
    "visa_prepaga": "visa-deb",
    "mastercard": "mc-cred",
    "mastercard_débito": "mc-deb",
    "mastercard_crédito": "mc-cred",
    "mastercard_prepaga": "mc-deb",
    "amex": "amex",
    "american_express": "amex",
    "cabal": "cabal-cred",
    "cabal_débito": "cabal-deb",
    "cabal_crédito": "cabal-cred",
    "naranja": "naranja",
    "naranja_x": "naranja",
    "diners": "diners",
    "maestro": "maestro",
    "transferencia": "transferencia",
    "qr": "qr",
    "pago_fácil": "transferencia",
    "rapipago": "transferencia",
  };
  return BANDERA_TO_METHODS[lower] || BANDERA_TO_METHODS[lower.split("_")[0]] || lower;
}

function isCardMethod(id: string) {
  return ["visa-cred", "mc-cred", "amex", "cabal-cred", "naranja", "diners", "visa-deb", "mc-deb", "cabal-deb", "maestro"].includes(id);
}

function Checkout() {
  const { code } = Route.useParams();
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "inactive" | "expired" | "success" | "error">("loading");
  const [data, setData] = useState<LinkData | null>(null);
  const [method, setMethod] = useState<string>("");
  const [montoPagar, setMontoPagar] = useState<string>("");
  const [titular, setTitular] = useState("");
  const [nro, setNro] = useState("");
  const [venc, setVenc] = useState("");
  const [cvv, setCvv] = useState("");
  const [email, setEmail] = useState("");
  const [documento, setDocumento] = useState("");
  const processingRef = useRef(false);
  const cardFormRef = useRef<HTMLFormElement | null>(null);
  const [processing, setProcessing] = useState(false);
  /**
   * Datos del comprobante que ve el pagador al terminar.
   *
   * `pagoEn` es la hora del navegador, no la del servidor: el backend no
   * devuelve el `created_at` que escribio en `cliente_links_pago_pagos`. Se
   * muestra en hora local de quien pago, que es como se lee un comprobante,
   * pero si hace falta la hora exacta del servidor hay que exponerla en la
   * respuesta de `/api/payway`.
   */
  const [result, setResult] = useState<{
    id: string;
    monto: number;
    ref: string;
    paywayPaymentId?: string;
    cuotas?: number;
    metodo?: string;
    pagoEn: Date;
    /** true cuando el cobro fue simulado (no se llamo a la pasarela). */
    simulado?: boolean;
  } | null>(null);
  const [comercioBanderas, setComercioBanderas] = useState<string[]>([]);
  /**
   * Filas de `comercio_banderas` con su UUID. El backend resuelve el metodo
   * a partir del id de bandera, no del texto visible, asi que hace falta
   * poder mapear "visa-cred" -> fila concreta del comercio del link.
   */
  const [banderasRows, setBanderasRows] = useState<Array<{ id: string; bandera: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = requireSupabase();
        console.log("[Checkout] code:", code);
        const { data: r, error: rpcErr } = await s.rpc("obtener_link_pago", { p_codigo: code });
        console.log("[Checkout] rpc result:", r, "error:", rpcErr);
        if (cancelled) return;
        if (!r) {
          setStatus("notfound");
          return;
        }
        const d = r as LinkData;

        const { data: linkRow } = await s
          .from("cliente_links_pago")
          .select("comercio_id, comercio_nombre")
          .eq("id", d.id)
          .maybeSingle();

        if (linkRow) {
          d.comercio_id = linkRow.comercio_id;
          d.comercio_nombre = linkRow.comercio_nombre;
        }

        if (d.estado === "Inactivo") {
          setData(d);
          setStatus("inactive");
          return;
        }
        if (d.expira_en && new Date(d.expira_en).getTime() < Date.now()) {
          setData(d);
          setStatus("expired");
          return;
        }
        await s.rpc("incrementar_vistas_link", { p_link_id: d.id });
        setData(d);

        if (d.comercio_id) {
          const { data: bandas } = await s
            .from("comercio_banderas")
            .select("id, bandera")
            .eq("comercio_id", d.comercio_id)
            .eq("estado", "Activo");
          console.log("[Checkout] bandas:", bandas);
          setBanderasRows((bandas ?? []) as Array<{ id: string; bandera: string }>);
          const flags = (bandas ?? []).map((b: { bandera: string }) => b.bandera.toLowerCase().replace(/\s+/g, "_"));
          console.log("[Checkout] flags:", flags);
          setComercioBanderas(flags);
          if (flags.length > 0) {
            setMethod(getMethodIdFromBandera(flags[0]));
          } else {
            const expanded = expandMethods(d.metodos_pago);
            setMethod((expanded[0] ?? d.metodos_pago?.[0] ?? "").trim());
          }
        } else {
          const expanded = expandMethods(d.metodos_pago);
          setMethod((expanded[0] ?? d.metodos_pago?.[0] ?? "").trim());
        }
        setMontoPagar(total(d).toFixed(2));
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const total = (d: LinkData) => {
    if (d.detalle?.length) {
      return d.detalle.reduce((a, p) => a + Number(p.precio_unitario) * Number(p.cantidad), 0);
    }
    return Number(d.monto ?? 0);
  };

  const metodosDisponibles = useMemo(() => {
    // Catálogo completo usado solo como diccionario id -> label. Nada se
    // muestra sin que el comercio lo habilite: la única fuente de verdad son
    // las banderas activas del comercio del link (o el `metodos_pago` que quedó
    // guardado en el link). No hay fallback que vuelque el catálogo entero ni
    // métodos agregados de forma incondicional.
    //
    // Cada bandera del comercio corresponde a UN método visible: si el comercio
    // tiene 3 banderas (Visa, Mastercard, Amex) se muestran 3 botones, no 6
    // por la expansión crédito/débito. Quien quiera débito por separado carga
    // la bandera "visa_débito" explícitamente.
    const base = [...paymentMethods, ...EXTRA_METHODS];
    const methodIds = new Set<string>();

    if (comercioBanderas.length > 0) {
      // El comercio se resolvió y tiene banderas activas: solo sus métodos.
      comercioBanderas.forEach((b) => {
        methodIds.add(getMethodIdFromBandera(b));
      });
    } else if (data?.metodos_pago?.length) {
      // Sin banderas resueltas (link sin comercio o lectura anónima limitada):
      // usar exactamente lo que guardó el link al crearse.
      data.metodos_pago.forEach((m) => {
        if (LOTE_CATEGORY_TO_METHODS[m]) {
          LOTE_CATEGORY_TO_METHODS[m].forEach((v) => methodIds.add(v));
          return;
        }
        methodIds.add(getMethodIdFromBandera(m));
      });
    }

    return base.filter((m) => methodIds.has(m.id));
  }, [data, comercioBanderas]);

  /**
   * Metodo elegido -> UUID de la fila `comercio_banderas` que lo representa.
   *
   * El backend resuelve el metodo_key y la bandera a partir de ese UUID; con
   * el texto del metodo ("visa-cred") el lookup falla cuando el comercio no
   * tiene ese metodo_key cargado. Si ninguna bandera cubre el metodo, devuelve
   * undefined y el backend cae al camino legacy con `method`.
   */
  const banderaIdDelMethod = (methodId: string): string | undefined => {
    if (!methodId) return undefined;
    return banderasRows.find((b) => variantsDeBandera(b.bandera).includes(methodId))?.id;
  };

  const isAmex = method === "amex";
  const cardDigitsMax = method === "amex" ? 15 : method === "diners" ? 14 : 16;
  const cvvMax = isAmex ? 4 : 3;

  /**
   * Prellena los datos de prueba de Payway, solo en desarrollo.
   *
   * Es una comodidad para no tipear 16 digitos en cada iteracion. El gate esta
   * en `isDevWithTestCard()`, que exige build de desarrollo mas el flag
   * explicito: en produccion esto no corre.
   *
   * Los campos se llenan para cualquier metodo de tarjeta cuyo PAN sea de 16
   * digitos. Amex (15) y Diners (14) se saltan a proposito: recortada, la
   * tarjeta daria un numero invalido en vez de un error que explique el motivo.
   */
  useEffect(() => {
    if (!isDevWithTestCard() || status !== "ready") return;
    if (!isCardMethod(method) || !testCardFitsMethod(method)) return;
    setTitular(PAYWAY_TEST_CARD.holderName);
    setNro(formatNro(PAYWAY_TEST_CARD.number));
    setVenc(formatVenc(PAYWAY_TEST_CARD.expiration));
    setCvv(PAYWAY_TEST_CARD.securityCode);
    setDocumento(PAYWAY_TEST_CARD.docNumber);
    setEmail(`test@${brand.web.domain}`);
    // formatNro/formatVenc dependen de cardDigitsMax, que ya esta definido
    // arriba y solo cambia al cambiar de metodo.
  }, [status, method]);

  const formatNro = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, cardDigitsMax);
    if (isAmex) {
      return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)]
        .filter(Boolean)
        .join(" ");
    }
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const formatVenc = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  };

  // El SDK lee mes y anio por separado desde el DOM, mientras que el formulario
  // muestra un unico "MM/AA". Se derivan del mismo estado para que no puedan
  // desincronizarse.
  const vencMes = venc.replace(/\D/g, "").slice(0, 2);
  const vencAnio = venc.replace(/\D/g, "").slice(2, 4);

  const chooseMethod = (id: string) => {
    setMethod(id);
    const amex = id === "amex";
    const max = id === "amex" ? 15 : id === "diners" ? 14 : 16;
    setNro((prev) => {
      const digits = prev.replace(/\D/g, "").slice(0, max);
      if (amex) {
        return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)]
          .filter(Boolean)
          .join(" ");
      }
      return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
    });
    setCvv((prev) => prev.slice(0, amex ? 4 : 3));
  };

  const validar = () => {
    if (!method) return "Selecciona un metodo de pago";
    if (isCardMethod(method)) {
      if (!titular.trim()) return "Ingresa el titular de la tarjeta";
      if (nro.replace(/\s/g, "").length !== cardDigitsMax) return "Numero de tarjeta invalido";
      if (!/^\d{2}\/\d{2}$/.test(venc)) return "Vencimiento invalido (MM/AA)";
      if (cvv.length !== cvvMax) return "CVV invalido";
      // La API de Payway exige la identificacion del titular: sin esto el token
      // no se genera y el error que vuelve no dice que falta este campo.
      if (documento.trim().length < 6) return "Ingresa el numero de documento del titular";
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Email invalido";
    const mp = parseFloat(montoPagar.replace(",", "."));
    if (data && (mp <= 0 || mp > total(data) + 0.001)) return "Monto a pagar invalido";
    // No se exige comercio_id: el backend lo deriva del link. Validarlo aca solo
    // serviria para bloquear pagos validos si el anon-read fallara.
    return null;
  };

  const pagar = async () => {
    const err = validar();
    if (err) {
      toast.error(err);
      return;
    }
    if (!data) return;
    setProcessing(true);
    try {
      const mp = parseFloat(montoPagar.replace(",", "."));

      // Se envia el codigo del link, no su id ni su monto. El backend resuelve
      // el link y calcula cuanto corresponde cobrar: el `mp` de arriba es un dato
      // de UI para links con pagos parciales, no una autoridad.
      const res = await paymentProcessor.process({
        linkCode: code,
        metodo: method,
        monto: mp,
        pagadorNombre: titular.trim(),
        pagadorEmail: email.trim(),
        card: isCardMethod(method)
          ? { number: nro, holderName: titular.trim(), expiration: venc, securityCode: cvv }
          : undefined,
        // El SDK de Payway lee la tarjeta del DOM, no de este objeto: necesita
        // el `<form>` con los atributos `data-decidir`.
        cardForm: isCardMethod(method) ? cardFormRef.current : null,
        ...(documento.trim() ? { documento: { type: "dni" as const, number: documento.trim() } } : {}),
      });

      // El monto que se muestra es el que confirmo el backend, no el que se
      // pidio desde el formulario.
      setResult({
        id: res.id,
        monto: res.monto ?? mp,
        ref: data.referencia ?? res.id,
        paywayPaymentId: res.paywayPaymentId,
        // El checkout no ofrece selector de cuotas, asi que el pedido sale sin
        // `cuotas` y el backend aplica su default (1). Solo tiene sentido
        // mostrarlo para metodos que se pagan en cuotas.
        cuotas: isCardMethod(method) ? 1 : undefined,
        metodo: metodosDisponibles.find((m) => m.id === method)?.label ?? method,
        pagoEn: new Date(),
      });
      setStatus("success");
    } catch (e: any) {
      // Los datos de la tarjeta no se conservan: si el usuario reintenta, vuelve
      // a tipearlos. Es una decision de PCI, no de conveniencia.
      if (isCardMethod(method)) {
        setNro("");
        setCvv("");
        setVenc("");
      }
      if (e?.name === "PaymentPendingError") {
        toast.info(e.message);
        return;
      }
      toast.error(e?.message || "No se pudo procesar el pago");
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Simulacion de pago: mismo camino que `pagar` menos la validacion de los
   * campos de tarjeta (no se tokeniza nada) y menos la llamada a la pasarela.
   * El backend registra el cobro via RPC como aprobado, asi que el movimiento
   * y los lotes quedan en la base igual que con un cobro real.
   */
  const simular = async () => {
    if (!method) {
      toast.error("Selecciona un metodo de pago");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error("Email invalido");
      return;
    }
    const mp = parseFloat(montoPagar.replace(",", "."));
    if (data && (mp <= 0 || mp > total(data) + 0.001)) {
      toast.error("Monto a pagar invalido");
      return;
    }
    if (!data) return;
    setProcessing(true);
    try {
      const res = await paymentProcessor.simulate({
        linkCode: code,
        metodo: method,
        banderaId: banderaIdDelMethod(method),
        monto: mp,
        pagadorNombre: titular.trim() || "Pago simulado",
        pagadorEmail: email.trim(),
        ...(documento.trim() ? { documento: { type: "dni" as const, number: documento.trim() } } : {}),
      });

      setResult({
        id: res.id,
        monto: res.monto ?? mp,
        ref: data.referencia ?? res.id,
        paywayPaymentId: res.paywayPaymentId,
        cuotas: isCardMethod(method) ? 1 : undefined,
        metodo: metodosDisponibles.find((m) => m.id === method)?.label ?? method,
        pagoEn: new Date(),
        simulado: true,
      });
      setStatus("success");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo simular el pago");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(120%_120%_at_50%_0%,#fff_40%,var(--brand-primary-50)_100%)] flex flex-col">
      {/* Barra de marca */}
      <header className="flex items-center justify-between px-5 py-4 max-w-4xl mx-auto w-full">
        <BrandLogo />
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <Lock size={13} /> Pago seguro
        </div>
      </header>

      <main className="flex-1 px-4 pb-10">
        <div className="w-full max-w-4xl mx-auto">
          {status === "loading" && (
            <CenterCard>
              <Loader2 className="animate-spin text-[color:var(--brand-primary-700)]" size={28} />
              <p className="text-sm text-muted-foreground mt-3">Cargando link de pago…</p>
            </CenterCard>
          )}

          {status === "notfound" && (
            <CenterCard>
              <AlertCircle className="text-muted-foreground" size={28} />
              <p className="font-semibold mt-3">Link no encontrado</p>
              <p className="text-xs text-muted-foreground mt-1">El enlace no existe o fue removido.</p>
            </CenterCard>
          )}

          {status === "inactive" && (
            <CenterCard>
              <AlertCircle className="text-amber-500" size={28} />
              <p className="font-semibold mt-3">Link inactivo</p>
              <p className="text-xs text-muted-foreground mt-1">Este cobro no esta disponible en este momento.</p>
            </CenterCard>
          )}

          {status === "expired" && (
            <CenterCard>
              <AlertCircle className="text-danger-500" size={28} />
              <p className="font-semibold mt-3">Link vencido</p>
              <p className="text-xs text-muted-foreground mt-1">La fecha de pago expiró.</p>
            </CenterCard>
          )}

          {status === "error" && (
            <CenterCard>
              <AlertCircle className="text-danger-500" size={28} />
              <p className="font-semibold mt-3">No pudimos cargar el link</p>
              <p className="text-xs text-muted-foreground mt-1">Intenta nuevamente mas tarde.</p>
            </CenterCard>
          )}

          {status === "success" && result && (
            <CenterCard>
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
                <CheckCircle2 className="text-emerald-600" size={32} />
              </div>
              <p className="font-bold text-lg">
                {result.simulado ? "Pago simulado" : "Pago aprobado"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {result.simulado
                  ? "Simulacion completada: no se realizo ningun cargo."
                  : "Gracias, tu operacion fue completada."}
              </p>
              {result.simulado && (
                <div className="w-full mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-semibold text-amber-800 text-left">
                  Pago simulado — el cobro quedo registrado en la base como aprobado, pero no se
                  realizo ningun cargo.
                </div>
              )}

              {/* El comercio y el monto van arriba y en cuerpo grande: es lo
                  unico que el pagador necesita confirmar de un vistazo. */}
              {data?.comercio_nombre && (
                <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-muted-foreground mt-3">
                  <ShieldCheck size={14} className="text-emerald-600" /> {data.comercio_nombre}
                </div>
              )}
              <div className="text-2xl font-black tracking-tight text-[color:var(--brand-primary-700)] mt-1">
                {formatARS(result.monto)}
              </div>

              {/* Detalle de lo que se pago. Es el mismo listado que se ve antes
                  de confirmar, para que el pagador pueda contrastar contra su
                  comprobante sin volver atras. */}
              {data?.detalle && data.detalle.length > 0 && (
                <div className="w-full mt-4 border rounded-lg divide-y text-left">
                  {data.detalle.map((p, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{p.producto_nombre}</div>
                        <div className="text-muted-foreground">
                          {p.cantidad} × {formatARS(p.precio_unitario)}
                        </div>
                      </div>
                      <div className="font-mono tabular-nums font-semibold">
                        {formatARS(p.precio_unitario * p.cantidad)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="w-full mt-4 space-y-2 text-sm">
                <Row label="Fecha y hora" value={formatFechaHora(result.pagoEn)} />
                {result.metodo && (
                  <Row
                    label="Metodo de pago"
                    value={result.cuotas ? `${result.metodo} - ${result.cuotas} cuota` : result.metodo}
                  />
                )}
                <Row label="Referencia" value={result.ref || "—"} />
                <Row label="Comprobante" value={String(result.id).slice(0, 8).toUpperCase()} />
                {/* Codigo de operacion de la pasarela. Es el dato que hay que
                    dar si el cobro hay que reclamarlo. */}
                {result.paywayPaymentId && (
                  <Row label="Codigo de operacion" value={result.paywayPaymentId} />
                )}
              </div>

              <p className="text-[11px] text-muted-foreground mt-4 text-left">
                Guardá el comprobante y el codigo de operacion. Con esos dos datos se puede
                rastrear el pago.
              </p>
            </CenterCard>
          )}

          {status === "ready" && data && (
            <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-6 items-start">
              {/* Resumen del cobro */}
              <Card className="p-6 shadow-xl border-0">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground mb-1">
                  <ShieldCheck size={14} className="text-emerald-600" /> {data.comercio_nombre || brand.name}
                </div>
                <div className="text-3xl font-black tracking-tight text-[color:var(--brand-primary-700)]">
                  {formatARS(parseFloat(montoPagar.replace(",", ".")))}
                </div>
                <div className="text-xs text-muted-foreground">Total a abonar</div>

                {data.detalle?.length > 0 && (
                  <div className="mt-4 border rounded-lg divide-y">
                    {data.detalle.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{p.producto_nombre}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {p.cantidad} × {formatARS(p.precio_unitario)}
                          </div>
                        </div>
                        <div className="font-mono tabular-nums font-semibold">
                          {formatARS(p.precio_unitario * p.cantidad)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {data.referencia && (
                  <div className="mt-4 text-xs text-muted-foreground">
                    Referencia: <span className="font-semibold text-foreground">{data.referencia}</span>
                  </div>
                )}
                {data.notas && (
                  <div className="mt-2 text-xs text-muted-foreground">{data.notas}</div>
                )}

                {data.pagos_parciales && (
                  <div className="mt-4">
                    <Label>Monto a pagar (pagos parciales habilitados)</Label>
                    <Input
                      className="mt-1"
                      inputMode="decimal"
                      value={montoPagar}
                      onChange={(e) => setMontoPagar(e.target.value)}
                    />
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Máximo {formatARS(total(data))}
                    </div>
                  </div>
                )}
              </Card>

              {/* Pago */}
              <Card className="p-6 shadow-xl border-0">
                <div>
                  <Label>Metodo de pago</Label>
                  {metodosDisponibles.length === 0 ? (
                    <p className="mt-1.5 rounded-lg border border-black-100 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                      No hay metodos de pago habilitados para este link. Contacta al comercio.
                    </p>
                  ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5">
                    {metodosDisponibles.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => chooseMethod(m.id)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-semibold transition ${
                          method === m.id
                            ? "border-[color:var(--brand-primary-700)] bg-[color:var(--brand-primary-50)] text-[color:var(--brand-primary-700)]"
                            : "bg-card hover:bg-muted"
                        }`}
                      >
                        <CreditCard size={15} /> {m.label}
                      </button>
                    ))}
                  </div>
                  )}
                </div>

                {metodosDisponibles.length === 0 ? null : isCardMethod(method) ? (
                  <form
                    ref={cardFormRef}
                    className="mt-6 rounded-lg border border-black-100 bg-[color:var(--brand-primary-50)] p-4"
                    onSubmit={(e) => e.preventDefault()}
                  >
                    <div className="flex items-center gap-2 text-sm font-bold mb-3">
                      <CreditCard size={17} className="text-[color:var(--brand-primary-700)]" />
                      Datos de la tarjeta
                    </div>
                    {/*
                      Aviso en pantalla cuando los campos vienen precargados con
                      datos de prueba. Es deliberado: una tarjeta de test
                      precargada que parece real es la forma mas facil de que
                      alguien pulse "pagar" creyendo que esta cobrando de verdad.
                    */}
                    {isDevWithTestCard() && testCardFitsMethod(method) && (
                      <p className="mb-3 rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-800">
                        Datos de prueba de sandbox, no usar con clientes reales.
                        {!isPaywayTestCardApproved(method) &&
                          " Esta tarjeta es Visa: solo aprueba en Visa, porque Payway exige que el medio de pago coincida con la marca."}
                      </p>
                    )}
                    <div className="space-y-3">
                      <div>
                        <Label>Titular de la tarjeta</Label>
                        <Input
                          className="mt-1 bg-card"
                          autoComplete="cc-name"
                          maxLength={60}
                          value={titular}
                          onChange={(e) => setTitular(e.target.value)}
                          placeholder="Como aparece en la tarjeta"
                          data-decidir="card_holder_name"
                        />
                      </div>
                      <div>
                        <Label>Numero de tarjeta</Label>
                        <Input
                          className="mt-1 bg-card font-mono tracking-wider"
                          inputMode="numeric"
                          autoComplete="cc-number"
                          value={nro}
                          onChange={(e) => setNro(formatNro(e.target.value))}
                          placeholder={isAmex ? "0000 000000 00000" : "0000 0000 0000 0000"}
                          data-decidir="card_number"
                        />
                      </div>
                      {/*
                        El SDK de Payway espera mes y anio por separado, no un
                        "MM/AA" combinado. El input visible no lleva
                        `data-decidir`: los valores que el SDK lee salen de los
                        dos inputs ocultos de abajo, derivados del mismo estado.
                      */}
                      <input type="hidden" readOnly data-decidir="card_expiration_month" value={vencMes} />
                      <input type="hidden" readOnly data-decidir="card_expiration_year" value={vencAnio} />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Vencimiento</Label>
                          <Input
                            className="mt-1 bg-card font-mono"
                            inputMode="numeric"
                            autoComplete="cc-exp"
                            maxLength={5}
                            value={venc}
                            onChange={(e) => setVenc(formatVenc(e.target.value))}
                            placeholder="MM/AA"
                            name="vencimiento"
                          />
                        </div>
                        <div>
                          <Label>CVV</Label>
                          {/*
                            El CVV se pide y se valida aca, pero NO lleva
                            `data-decidir`: el SDK de Payway no lo usa para
                            tokenizar (solo para re-pagar con una tarjeta ya
                            tokenizada). Marcarlo mandaria el CVV dentro de un
                            payload que la API puede rechazar.
                          */}
                          <Input
                            className="mt-1 bg-card font-mono"
                            inputMode="numeric"
                            autoComplete="cc-csc"
                            maxLength={cvvMax}
                            value={cvv}
                            onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, cvvMax))}
                            placeholder={isAmex ? "1234" : "123"}
                            name="cvv"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Numero de documento del titular</Label>
                        {/*
                          La API de Payway exige `card_holder_identification`.
                          El SDK la arma a partir de estos dos campos: si estan
                          presentes produce el objeto, y si no, no lo manda. Por
                          eso el tipo va fijo en hidden y solo el numero es
                          editable.
                        */}
                        <input type="hidden" readOnly data-decidir="card_holder_doc_type" value="dni" />
                        <Input
                          className="mt-1 bg-card font-mono"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={12}
                          value={documento}
                          onChange={(e) => setDocumento(e.target.value.replace(/\D/g, "").slice(0, 12))}
                          placeholder="12345678"
                          data-decidir="card_holder_doc_number"
                        />
                      </div>
                    </div>
                  </form>
                ) : (
                  <div className="mt-6 rounded-lg border border-black-100 bg-[color:var(--brand-primary-50)] p-4">
                    <div className="flex items-center gap-2 text-sm font-bold mb-3">
                      <CreditCard size={17} className="text-[color:var(--brand-primary-700)]" />
                      {method === "qr" ? "Codigo QR" : "Datos de transferencia"}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {method === "qr"
                        ? "Se generara un codigo QR para completar el pago."
                        : "Se te indicaran los datos de la cuenta para transferir."}
                    </p>
                  </div>
                )}

                <div className="mt-4">
                  <Label>Email para el comprobante</Label>
                  <Input className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
                </div>

                <BtnPrimary className="w-full mt-6 h-12 text-sm" onClick={pagar} disabled={processing || metodosDisponibles.length === 0}>
                  {processing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Procesando…
                    </>
                  ) : (
                    `Pagar ${formatARS(parseFloat(montoPagar.replace(",", ".")))}`
                  )}
                </BtnPrimary>

                {/*
                  Boton de simulacion: registra el cobro en la base como
                  aprobado sin llamar a la pasarela, para probar el flujo
                  completo (comprobante, movimiento, lotes) sin tarjeta ni
                  sandbox de Payway. El backend lo responde con 404 en
                  produccion, asi que aunque aparezca nunca simula un cobro
                  contra datos reales.
                */}
                <button
                  type="button"
                  onClick={simular}
                  disabled={processing}
                  className="w-full mt-3 h-11 text-sm rounded-lg border-2 border-dashed border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Simulando…
                    </>
                  ) : (
                    <>
                      <FlaskConical size={15} /> Simular pago (solo test)
                    </>
                  )}
                </button>

                <p className="text-[11px] text-center text-muted-foreground mt-3 flex items-center justify-center gap-1">
                  <Lock size={11} /> Tus datos se transmiten cifrados
                </p>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function CenterCard({ children }: { children: ReactNode }) {
  return (
    <Card className="p-8 shadow-xl border-0 flex flex-col items-center text-center mx-auto max-w-md w-full">
      {children}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      {/* `break-all` porque los valores son ids: en pantallas angostas un
          comprobante o un codigo de operacion no tienen donde cortar. */}
      <span className="font-semibold font-mono text-right break-all min-w-0">{value}</span>
    </div>
  );
}
