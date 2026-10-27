import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Search, Store } from "lucide-react";
import { PageHeader, Card, Badge, Input, BtnOutline } from "@/components/portal-shell";
import { requireSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export const Route = createFileRoute("/app/mis-comercios")({ component: Page });

type Comercio = {
  id: string;
  nombre: string;
  legajo: string;
  nivel: string;
  estado: string;
  usuario: string;
  creado: string;
};

type ComercioRow = Pick<
  Tables<"comercios">,
  "id" | "nombre_comercio" | "legajo" | "nivel" | "estado" | "usuario" | "created_at"
>;

const mapComercios = (rows: ComercioRow[] | null): Comercio[] =>
  (rows ?? []).map((r) => ({
    id: r.id,
    nombre: r.nombre_comercio ?? "Comercio",
    legajo: r.legajo ?? "",
    nivel: r.nivel ?? "—",
    estado: r.estado ?? "—",
    usuario: r.usuario ?? "",
    creado: (r.created_at ?? "").slice(0, 10),
  }));

const estadoTone = (estado: string): "neutral" | "success" | "warn" | "danger" => {
  const e = estado.toLowerCase();
  if (e.includes("activ") || e.includes("activo") || e.includes("aprob")) return "success";
  if (
    e.includes("desactiv") ||
    e.includes("rechaz") ||
    e.includes("elimin") ||
    e.includes("cancel")
  )
    return "danger";
  if (e.includes("pendiente") || e.includes("suspend")) return "warn";
  return "neutral";
};

function Page() {
  const [comercios, setComercios] = useState<Comercio[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [nivel, setNivel] = useState("Todos");
  const [estado, setEstado] = useState("Todos");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    (async () => {
      try {
        const s = requireSupabase();
        const { data: u } = await s.auth.getUser();
        const mail = u.user?.email;
        if (!mail) return;
        const { data: cli } = await s
          .from("clientes")
          .select("legajo")
          .eq("correo", mail)
          .maybeSingle();
        if (!cli?.legajo) return;
        const { data: rows } = await s
          .from("comercios")
          .select("id, nombre_comercio, legajo, nivel, estado, usuario, created_at")
          .or(`legajo.eq.${cli.legajo},usuario.eq.${mail}`)
          .order("created_at", { ascending: false });
        setComercios(mapComercios(rows));
      } catch {
        // silencioso
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const niveles = useMemo(
    () => Array.from(new Set(comercios.map((c) => c.nivel).filter(Boolean))).sort(),
    [comercios],
  );
  const estados = useMemo(
    () => Array.from(new Set(comercios.map((c) => c.estado).filter(Boolean))).sort(),
    [comercios],
  );

  const filtradas = useMemo(
    () =>
      comercios.filter(
        (c) =>
          (q === "" ||
            c.nombre.toLowerCase().includes(q.toLowerCase()) ||
            c.legajo.toLowerCase().includes(q.toLowerCase()) ||
            c.usuario.toLowerCase().includes(q.toLowerCase())) &&
          (nivel === "Todos" || c.nivel === nivel) &&
          (estado === "Todos" || c.estado === estado),
      ),
    [comercios, q, nivel, estado],
  );

  const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize));
  const paginated = filtradas.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, nivel, estado]);

  const activos = comercios.filter((c) => estadoTone(c.estado) === "success").length;

  return (
    <>
      <PageHeader
        title="Mis comercios"
        description="Los comercios asociados a tu cuenta."
        action={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="bg-white border border-black-100 rounded-md px-4 py-2 flex items-center gap-2">
              <Store size={14} className="text-highlight" />
              <span className="font-semibold text-black-700">{comercios.length}</span> comercios
            </div>
            <div className="bg-white border border-black-100 rounded-md px-4 py-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-success inline-block" />
              <span className="font-semibold text-black-700">{activos}</span> activos
            </div>
          </div>
        }
      />

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, legajo o email..."
              className="pl-9"
            />
          </div>
          <select
            value={nivel}
            onChange={(e) => setNivel(e.target.value)}
            className="h-10 px-3 rounded-md border bg-card text-sm"
          >
            <option>Todos</option>
            {niveles.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="h-10 px-3 rounded-md border bg-card text-sm"
          >
            <option>Todos</option>
            {estados.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </div>
      </Card>

      {loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Cargando comercios…</Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5">Comercio</th>
                  <th className="text-left px-4 py-2.5">Legajo</th>
                  <th className="text-left px-4 py-2.5">Nivel</th>
                  <th className="text-left px-4 py-2.5">Estado</th>
                  <th className="text-left px-4 py-2.5">Email de usuario</th>
                  <th className="text-left px-4 py-2.5">Creado</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center bg-highlight/10 text-highlight">
                          <Store size={15} />
                        </span>
                        <span className="font-semibold">{c.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {c.legajo}
                    </td>
                    <td className="px-4 py-3">{c.nivel}</td>
                    <td className="px-4 py-3">
                      <Badge tone={estadoTone(c.estado)}>{c.estado}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.usuario}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.creado}</td>
                  </tr>
                ))}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No hay comercios para mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground">
            <span>
              {filtradas.length === 0
                ? "0 registros"
                : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtradas.length)} de ${filtradas.length}`}
            </span>
            <div className="flex gap-1">
              <BtnOutline
                className="h-7 px-2 text-[11px]"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </BtnOutline>
              <BtnOutline
                className="h-7 px-2 text-[11px]"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente
              </BtnOutline>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
