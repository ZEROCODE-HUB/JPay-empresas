import { createFileRoute } from "@tanstack/react-router";
import { brand } from "@/brand/brand";
import { useState, useEffect } from "react";
import {
  Building2,
  Upload,
  FileText,
  CheckCircle2,
  CreditCard,
  SlidersHorizontal,
  Download,
  Landmark,
  User,
  Shield,
  Activity,
  TrendingUp,
  Eye,
} from "lucide-react";
import {
  PageHeader,
  Card,
  Input,
  Label,
  BtnPrimary,
  BtnOutline,
  Badge,
} from "@/components/portal-shell";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { useOnboarding } from "@/lib/onboarding-store";
import { requireSupabase, getSignedDocUrls } from "@/lib/supabase";
import { DocPreviewModal } from "@/components/doc-preview";
import { ESTADO_LABEL, normalizarEstado, siguientePasoOnboarding } from "@/lib/cliente-estados";

export const Route = createFileRoute("/app/cuenta")({ component: Page });

type DocReal = {
  tipo: string;
  rawTipo: string;
  label: string;
  url: string;
  signedUrl: string | null;
  kind: "image" | "pdf" | "file";
  date?: string;
};

const TIPO_LABEL: Record<string, string> = {
  id_frente: "DNI Frente",
  id_dorso: "DNI Dorso",
  servicio: "Comprobante de servicio",
  selfie: "Selfie con DNI",
};

const IMG_EXT = [
  "png",
  "jpg",
  "jpeg",
  "jpe",
  "jfif",
  "jif",
  "webp",
  "gif",
  "bmp",
  "heic",
  "avif",
  "tiff",
  "tif",
];

function kindOf(label: string, url: string): DocReal["kind"] {
  const ext = (label || url).split(".").pop()?.toLowerCase() ?? "";
  if (IMG_EXT.includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "file";
}

function fmtFechaDoc(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtArs(v: any) {
  if (v == null || v === "") return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(v));
}

const planEmpresa = {
  nombre: "Plan Empresa",
  precio: "$ 48.000 / mes",
  ops: "5.000 operaciones incluidas",
  used: 3240,
  total: 5000,
};

const planPersona = {
  nombre: "Plan Personal",
  precio: "$ 9.900 / mes",
  ops: "500 operaciones incluidas",
  used: 278,
  total: 500,
};

function Page() {
  const [cbuPreview, setCbuPreview] = useState(false);
  const [docPreview, setDocPreview] = useState<DocReal | null>(null);
  const [kycDocs, setKycDocs] = useState<DocReal[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [cliente, setCliente] = useState<any | null>(null);
  const [movCount, setMovCount] = useState(0);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const { tipoCuenta, registro, datosPersonales, datosEmpresa, kyc, emailValidado } =
    useOnboarding();

  const isPJ = cliente?.tipo_persona
    ? cliente.tipo_persona === "juridica"
    : tipoCuenta === "juridica";
  const plan = isPJ ? planEmpresa : planPersona;
  const estadoNorm = cliente?.estado
    ? normalizarEstado(cliente.estado as string)
    : emailValidado
      ? ("registrado" as const)
      : ("pendiente_verificacion" as const);
  const estadoLabel = ESTADO_LABEL[estadoNorm];
  const aprobado = estadoNorm === "activado";

  const [userNombre, userApellido] = (cliente?.nombre ?? "").split(" ");
  const userEmail = cliente?.correo ?? registro.email ?? "";
  const userNac = cliente?.fecha_nacimiento ?? registro.fechaNac ?? "";

  const dp = {
    genero: cliente?.genero ?? datosPersonales.genero ?? "Femenino",
    cuitCuil: cliente?.cuit_cuil ?? datosPersonales.cuitCuil ?? "",
    ocupacion: cliente?.ocupacion ?? datosPersonales.ocupacion ?? "",
    origenFondos: cliente?.origen_fondos ?? datosPersonales.origenFondos ?? "Actividad comercial",
    esPEP: cliente?.es_pep ?? datosPersonales.esPEP ?? false,
  };

  const empresaInfo = {
    nombreLegal: cliente?.nombre_legal ?? datosEmpresa.nombreLegal ?? "",
    nombreFantasia: cliente?.nombre_fantasia ?? datosEmpresa.nombreFantasia ?? "",
    cuit: cliente?.cuit ?? datosEmpresa.cuit ?? "",
    tipoId: cliente?.tipo_sociedad ?? datosEmpresa.tipoId ?? "Sociedad Anonima (SA)",
    fechaInscripcion: cliente?.fecha_inscripcion ?? datosEmpresa.fechaInscripcion ?? "",
  };

  const dir = {
    direccion: cliente?.direccion ?? kyc.direccion ?? "",
    ciudad: cliente?.ciudad ?? kyc.ciudad ?? "",
    provincia: cliente?.provincia ?? kyc.provincia ?? "",
    cp: cliente?.cp ?? (isPJ ? "C1043" : "C1425"),
  };

  const cbu = {
    cbu: cliente?.cbu ?? "—",
    alias: cliente?.alias ?? "—",
  };

  const clienteToForm = (c: any) => {
    const [n, ...rest] = (c.nombre ?? "").split(" ");
    return {
      nombre: n ?? "",
      apellido: rest.join(" "),
      nombreLegal: c.nombre_legal ?? "",
      nombreFantasia: c.nombre_fantasia ?? "",
      cuit: c.cuit ?? "",
      tipo_sociedad: c.tipo_sociedad ?? "",
      fecha_inscripcion: c.fecha_inscripcion ?? "",
      direccion: c.direccion ?? "",
      ciudad: c.ciudad ?? "",
      provincia: c.provincia ?? "",
      cp: c.cp ?? "",
      telefono: c.telefono ?? "",
      actividad: c.actividad ?? "",
      genero: c.genero ?? "",
      cuit_cuil: c.cuit_cuil ?? "",
      fecha_nacimiento: c.fecha_nacimiento ?? "",
      ocupacion: c.ocupacion ?? "",
      origen_fondos: c.origen_fondos ?? "",
      es_pep: c.es_pep ?? false,
    };
  };

  const setF = (k: string, v: any) => setForm((p: typeof form) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (cliente) setForm(clienteToForm(cliente));
  }, [cliente]);

  const guardar = async () => {
    if (!cliente) return;
    setSaving(true);
    try {
      const s = requireSupabase();
      const nombre = `${form.nombre ?? ""} ${form.apellido ?? ""}`.trim();
      const patch = {
        nombre,
        nombre_legal: form.nombreLegal || null,
        nombre_fantasia: form.nombreFantasia || null,
        cuit: form.cuit || null,
        tipo_sociedad: form.tipo_sociedad || null,
        fecha_inscripcion: form.fecha_inscripcion || null,
        direccion: form.direccion || null,
        ciudad: form.ciudad || null,
        provincia: form.provincia || null,
        cp: form.cp || null,
        telefono: form.telefono || null,
        actividad: form.actividad || null,
        genero: form.genero || null,
        cuit_cuil: form.cuit_cuil || null,
        fecha_nacimiento: form.fecha_nacimiento || null,
        ocupacion: form.ocupacion || null,
        origen_fondos: form.origen_fondos || null,
        es_pep: !!form.es_pep,
      };
      const { error } = await s.from("clientes").update(patch).eq("legajo", cliente.legajo);
      if (error) throw error;
      setCliente({ ...cliente, ...patch });
      toast.success("Cambios guardados");
    } catch {
      toast.error("No se pudieron guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const s = requireSupabase();
        const { data: u } = await s.auth.getUser();
        const mail = u.user?.email;
        if (!mail) return;
        const { data: cli } = await s.from("clientes").select("*").eq("correo", mail).maybeSingle();
        setCliente(cli);
        if (cli) {
          const { data: docs } = await s
            .from("documentos")
            .select("tipo, url, label, created_at")
            .eq("cliente_legajo", cli.legajo);
          const rawDocs = (docs ?? []) as any[];
          const urls = await getSignedDocUrls(rawDocs.map((d) => d.url));
          setKycDocs(
            rawDocs.map((d) => ({
              tipo: TIPO_LABEL[d.tipo] ?? d.tipo,
              rawTipo: d.tipo,
              label: d.label ?? d.url,
              url: d.url,
              signedUrl: urls[d.url] ?? null,
              kind: kindOf(d.label ?? d.url, d.url),
              date: d.created_at,
            })),
          );
          const start = new Date();
          start.setDate(1);
          start.setHours(0, 0, 0, 0);
          const { count } = await s
            .from("transactions")
            .select("*", { count: "exact", head: true })
            .eq("legajo", cli.legajo)
            .gte("fecha", start.toISOString());
          setMovCount(count ?? 0);
        }
      } catch {
        // silencioso
      } finally {
        setLoadingDocs(false);
      }
    })();
  }, []);

  const antiguedad = (() => {
    const base = cliente?.fecha_alta
      ? new Date(cliente.fecha_alta)
      : cliente?.created_at
        ? new Date(cliente.created_at)
        : null;
    if (!base) return "—";
    const now = new Date();
    const months =
      (now.getFullYear() - base.getFullYear()) * 12 + (now.getMonth() - base.getMonth());
    if (months < 1) return "Reciente";
    if (months < 12) return `${months} meses`;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    return rem
      ? `${years} año${years > 1 ? "s" : ""} ${rem} mes${rem > 1 ? "es" : ""}`
      : `${years} año${years > 1 ? "s" : ""}`;
  })();

  const score = (() => {
    if (!cliente) return 86;
    let s = 55;
    if (aprobado) s += 20;
    if (cliente.direccion) s += 8;
    if (cliente.telefono) s += 7;
    s += Math.min(10, kycDocs.length * 2.5);
    return Math.min(100, Math.round(s));
  })();

  const stats = [
    {
      icon: Shield,
      label: "Estado KYC",
      value: aprobado
        ? "Validado"
        : cliente?.estado_onboarding === "pendiente"
          ? "Pendiente"
          : cliente?.estado_onboarding === "rechazado"
            ? "Rechazado"
            : "Pendiente",
      sub: aprobado ? "Verificado" : "En revisión",
    },
    { icon: Activity, label: "Transacciones mes", value: movCount.toLocaleString() },
    { icon: User, label: "Antigüedad", value: antiguedad },
    {
      icon: TrendingUp,
      label: "Score de seguridad",
      value: `${score} / 100`,
      sub: "Recomendado: 80+",
    },
  ];

  return (
    <>
      <PageHeader
        title="Mi cuenta"
        description={
          isPJ
            ? "Datos del titular, documentacion societaria, facturacion y plan."
            : "Datos personales, documentacion KYC, facturacion y plan."
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">
              <s.icon size={12} className="shrink-0" />
              {s.label}
            </div>
            <div className="font-display tabular-nums text-sm font-semibold mt-0.5">{s.value}</div>
            {s.sub && <div className="text-[9px] text-muted-foreground">{s.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <div className="space-y-6">
          {/* Informacion del Usuario */}
          <Card>
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <User size={16} /> Informacion del Usuario
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={form.nombre ?? userNombre}
                  onChange={(e) => setF("nombre", e.target.value)}
                />
              </div>
              <div>
                <Label>Apellido</Label>
                <Input
                  value={form.apellido ?? userApellido}
                  onChange={(e) => setF("apellido", e.target.value)}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={userEmail} readOnly />
              </div>
              <div>
                <Label>Estado</Label>
                <div className="pt-1.5 flex flex-col gap-1">
                  <Badge
                    tone={
                      estadoNorm === "activado"
                        ? "success"
                        : estadoNorm === "suspendido" || estadoNorm === "eliminado"
                          ? "danger"
                          : estadoNorm === "deshabilitado"
                            ? "neutral"
                            : "warn"
                    }
                  >
                    {estadoLabel}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {siguientePasoOnboarding(estadoNorm)}
                  </span>
                </div>
              </div>
            </div>
            <hr className="my-4 border-border" />
            <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm">
              <FileText size={14} /> Datos personales
            </h4>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>CUIL / CUIT</Label>
                <Input
                  value={form.cuit_cuil ?? dp.cuitCuil}
                  onChange={(e) => setF("cuit_cuil", e.target.value)}
                />
              </div>
              <div>
                <Label>DNI</Label>
                <Input defaultValue={isPJ ? "30.123.456" : "32.123.456"} />
              </div>
              <div>
                <Label>Genero</Label>
                <select
                  className="w-full h-10 px-3 rounded-md border bg-card text-sm"
                  value={form.genero ?? dp.genero}
                  onChange={(e) => setF("genero", e.target.value)}
                >
                  <option>{form.genero ?? dp.genero}</option>
                </select>
              </div>
              <div>
                <Label>Nacimiento</Label>
                <Input
                  type="date"
                  value={form.fecha_nacimiento ?? userNac}
                  onChange={(e) => setF("fecha_nacimiento", e.target.value)}
                />
              </div>
              <div>
                <Label>Ocupacion</Label>
                <Input
                  value={form.ocupacion ?? dp.ocupacion}
                  onChange={(e) => setF("ocupacion", e.target.value)}
                />
              </div>
              <div>
                <Label>Fuente de Fondos</Label>
                <select
                  className="w-full h-10 px-3 rounded-md border bg-card text-sm"
                  value={form.origen_fondos ?? dp.origenFondos}
                  onChange={(e) => setF("origen_fondos", e.target.value)}
                >
                  <option>{form.origen_fondos ?? dp.origenFondos}</option>
                </select>
              </div>
              <div>
                <Label>PEP</Label>
                <div className="pt-1.5 text-sm">{dp.esPEP ? "Si" : "No"}</div>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <BtnOutline
                disabled={saving}
                onClick={() => cliente && setForm(clienteToForm(cliente))}
              >
                Cancelar
              </BtnOutline>
              <BtnPrimary disabled={saving} onClick={guardar}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </BtnPrimary>
            </div>
          </Card>

          {/* Informacion adicional (PF y PJ) */}
          <Card>
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Landmark size={16} /> Informacion adicional
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Direccion</Label>
                <Input
                  value={form.direccion ?? dir.direccion}
                  onChange={(e) => setF("direccion", e.target.value)}
                />
              </div>
              <div>
                <Label>Ciudad</Label>
                <Input
                  value={form.ciudad ?? dir.ciudad}
                  onChange={(e) => setF("ciudad", e.target.value)}
                />
              </div>
              <div>
                <Label>Provincia</Label>
                <Input
                  value={form.provincia ?? dir.provincia}
                  onChange={(e) => setF("provincia", e.target.value)}
                />
              </div>
              <div>
                <Label>Codigo Postal</Label>
                <Input value={form.cp ?? dir.cp} onChange={(e) => setF("cp", e.target.value)} />
              </div>
              <div className="sm:col-span-2 flex gap-2 justify-end">
                <BtnOutline
                  disabled={saving}
                  onClick={() => cliente && setForm(clienteToForm(cliente))}
                >
                  Cancelar
                </BtnOutline>
                <BtnPrimary disabled={saving} onClick={guardar}>
                  {saving ? "Guardando…" : "Guardar cambios"}
                </BtnPrimary>
              </div>
            </div>
          </Card>

          {/* Informacion de la Empresa (solo PJ) */}
          {isPJ && (
            <Card>
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Building2 size={16} /> Informacion de la Empresa
              </h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Nombre Legal</Label>
                  <Input
                    value={form.nombreLegal ?? empresaInfo.nombreLegal}
                    onChange={(e) => setF("nombreLegal", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Nombre Comercial</Label>
                  <Input
                    value={form.nombreFantasia ?? empresaInfo.nombreFantasia}
                    onChange={(e) => setF("nombreFantasia", e.target.value)}
                  />
                </div>
                <div>
                  <Label>CUIT</Label>
                  <Input
                    value={form.cuit ?? empresaInfo.cuit}
                    onChange={(e) => setF("cuit", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Tipo de sociedad</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border bg-card text-sm"
                    value={form.tipo_sociedad ?? empresaInfo.tipoId}
                    onChange={(e) => setF("tipo_sociedad", e.target.value)}
                  >
                    <option>{form.tipo_sociedad ?? empresaInfo.tipoId}</option>
                  </select>
                </div>
                <div>
                  <Label>Actividad principal</Label>
                  <Input
                    value={form.actividad ?? "Servicios financieros"}
                    onChange={(e) => setF("actividad", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Fecha de inscripcion</Label>
                  <Input
                    type="date"
                    value={form.fecha_inscripcion ?? empresaInfo.fechaInscripcion}
                    onChange={(e) => setF("fecha_inscripcion", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Telefono</Label>
                  <Input
                    value={form.telefono ?? ""}
                    onChange={(e) => setF("telefono", e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2 flex gap-2 justify-end">
                  <BtnOutline
                    disabled={saving}
                    onClick={() => cliente && setForm(clienteToForm(cliente))}
                  >
                    Cancelar
                  </BtnOutline>
                  <BtnPrimary disabled={saving} onClick={guardar}>
                    {saving ? "Guardando…" : "Guardar cambios"}
                  </BtnPrimary>
                </div>
              </div>
            </Card>
          )}

          {/* Documentacion KYC/KYB */}
          <Card>
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <FileText size={16} /> Documentacion {isPJ ? "KYC / KYB" : "KYC"}
            </h3>
            {loadingDocs ? (
              <p className="text-sm text-muted-foreground">Cargando documentos…</p>
            ) : kycDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aun no cargaste documentos en tu onboarding.
              </p>
            ) : (
              <div className="divide-y">
                {kycDocs.map((d) => (
                  <div key={d.rawTipo + d.label} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      <div>
                        <div className="text-sm font-semibold">{d.tipo}</div>
                        <div className="text-xs text-muted-foreground">
                          Subido el {fmtFechaDoc(d.date)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <BtnOutline className="h-9 px-2.5 text-xs" onClick={() => setDocPreview(d)}>
                        <Eye size={13} />
                      </BtnOutline>
                      <BtnOutline className="h-9 px-3 text-xs">
                        <Upload size={12} /> Reemplazar
                      </BtnOutline>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* CVU */}
          <Card>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Landmark size={16} className="shrink-0 text-primary-ink" />
              Informacion de CVU
            </h3>
            <div className="text-xs space-y-2">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">CVU</span>
                <span className="font-mono font-semibold truncate">{cbu.cbu}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Alias</span>
                <span className="font-mono font-semibold truncate">{cbu.alias}</span>
              </div>
            </div>
          </Card>

          {/* Plan */}
          <Card className="bg-gradient-to-br from-[color:var(--brand-primary-50)] to-card">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">{plan.nombre}</h3>
              <Badge tone="success">Activo</Badge>
            </div>
            <div className="font-display tabular-nums text-2xl font-semibold">{plan.precio}</div>
            <div className="text-xs text-muted-foreground">{plan.ops}</div>
            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Consumo del mes</span>
                <span className="font-semibold">
                  {plan.used.toLocaleString()} / {plan.total.toLocaleString()}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${(plan.used / plan.total) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <BtnPrimary className="flex-1">Ampliar plan</BtnPrimary>
              <BtnOutline>Ver detalle</BtnOutline>
            </div>
          </Card>

          {/* Constancia CBU */}
          <Card>
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-semibold text-sm flex items-center gap-2 min-w-0">
                <Landmark size={16} className="shrink-0 text-primary-ink" />
                <span className="truncate">Constancia de CBU</span>
              </h3>
              <Badge tone="success">Oficial</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Documento oficial con razon social{isPJ ? ", CUIT" : ""}, CBU y alias.
            </p>
            <BtnPrimary className="w-full" onClick={() => setCbuPreview(true)}>
              <Download size={14} /> Descargar constancia (PDF)
            </BtnPrimary>
          </Card>

          {/* FacturaciOn */}
          <Card>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <CreditCard size={16} /> Facturacion
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Metodo de pago</span>
                <span className="font-semibold">Debito CVU</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Proxima factura</span>
                <span className="font-semibold">01/07/2026</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto estimado</span>
                <span className="font-semibold">{plan.precio}</span>
              </div>
            </div>
            <BtnOutline className="w-full mt-4">Ver historial de facturas</BtnOutline>
          </Card>

          {/* Representantes legales (solo PJ) */}
          {isPJ && (
            <Card>
              <h3 className="font-semibold text-sm mb-3">Representantes legales</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="font-semibold">
                    {userNombre} {userApellido}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {dp.cuitCuil} &middot; Presidenta
                  </div>
                </div>
                <div>
                  <div className="font-semibold">Diego Mendez</div>
                  <div className="text-xs text-muted-foreground">
                    20-29888777-3 &middot; Apoderado
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* LImites operativos */}
          <Card>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <SlidersHorizontal size={14} /> Limites operativos
            </h3>
            <p className="text-[11px] text-muted-foreground mb-3">
              Configurados por {brand.company.shortName}. Para modificarlos contacta a tu ejecutivo.
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto max. por transferencia</span>
                <span className="font-semibold">{fmtArs(cliente?.limite_transferencia)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Operaciones diarias</span>
                <span className="font-semibold">{cliente?.limite_ops_diarias ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto acumulado diario</span>
                <span className="font-semibold">{fmtArs(cliente?.limite_monto_diario)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Horario operativo</span>
                <span className="font-semibold">06:00 &ndash; 23:00</span>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground border-t pt-2">
              Ultima actualizacion: 01/06/2026 por equipo {brand.company.shortName}
            </div>
          </Card>
        </div>
      </div>

      {/* Modal: Constancia CBU */}
      {cbuPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCbuPreview(false)} />
          <div className="relative bg-card rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-card border-b px-6 py-4 flex justify-between items-center z-10">
              <div className="font-semibold">Vista previa &mdash; Constancia de CBU</div>
              <BtnOutline className="h-8 px-3 text-xs" onClick={() => setCbuPreview(false)}>
                Cerrar
              </BtnOutline>
            </div>
            <div className="p-8 space-y-5">
              <div className="flex items-center justify-between border-b pb-4">
                <BrandLogo />
                <div className="text-right text-xs text-muted-foreground">
                  <div className="font-mono font-semibold text-foreground">CBU-EMP-2026-000042</div>
                  <div>Generado: {new Date().toLocaleString("es-AR")}</div>
                </div>
              </div>
              <h2 className="text-xl font-semibold">Constancia de CBU</h2>
              <p className="text-xs text-muted-foreground">
                {brand.company.legalName} certifica que la siguiente cuenta esta activa:
              </p>
              <Card className="bg-muted/30">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      {isPJ ? "Razon social" : "Titular"}
                    </span>
                    <span className="font-semibold text-right">
                      {isPJ ? empresaInfo.nombreLegal : `${userNombre} ${userApellido}`}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{isPJ ? "CUIT" : "CUIL"}</span>
                    <span className="font-mono font-semibold">{dp.cuitCuil}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">CVU</span>
                    <span className="font-mono font-semibold text-right break-all">{cbu.cbu}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Alias</span>
                    <span className="font-mono font-semibold">{cbu.alias}</span>
                  </div>
                </div>
              </Card>
              <div className="text-[11px] text-muted-foreground border-t pt-3">
                Documento firmado digitalmente por {brand.company.legalName}. Valido como constancia
                oficial de cuenta.
              </div>
              <div className="flex gap-2 pt-1">
                <BtnOutline className="flex-1" onClick={() => setCbuPreview(false)}>
                  Cancelar
                </BtnOutline>
                <BtnPrimary
                  className="flex-1"
                  onClick={() => {
                    setCbuPreview(false);
                    toast.success("Constancia de CBU descargada");
                  }}
                >
                  <Download size={14} /> Descargar PDF
                </BtnPrimary>
              </div>
            </div>
          </div>
        </div>
      )}

      <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
    </>
  );
}
