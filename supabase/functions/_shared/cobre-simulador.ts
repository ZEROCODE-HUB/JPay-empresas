// Simulador de Cobre (modo `simulado`): mientras no haya instancia de prueba de Cobre para
// México, responde los mismos endpoints con los formatos documentados, sobre un almacén propio
// (tabla `cobre_simulador` o memoria en los tests). Se enchufa como `fetch` del CobreCliente.
//
// Reglas de la simulación (para probar los caminos felices y los de error):
// - Transferencia: `initiated` → (1 s) `processing` (debita) → (4 s) `completed`.
//   Si el saldo no alcanza → `failed` F002 sin debitar. Si el titular del destinatario contiene
//   "RECHAZO" → `rejected` R005 y se reintegra (transacción `spei_rejected`).
//   Con `checker_approval` queda en `pending_approval` hasta aprobarla o cancelarla.
// - Verificación de cuenta: a los 5 s `matched`; CLABE terminada en 0000X → `unmatched`,
//   en 1111X → `unresolved` (X = dígito verificador).
// - Depósitos: `depositoSimulado` crea un `spei_credit` en la cuenta dueña de la CLABE.
// - Cada cambio deja un evento en cola (`accounts.balance.*`, `money_movements.status.*`) que
//   `cobre-simulador` firma y envía a `cobre-webhook`, como haría Cobre.
//
// Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).

type Obj = Record<string, unknown>;

export interface AlmacenSim {
  leer(tipo: string, id: string): Promise<Obj | null>;
  guardar(tipo: string, id: string, datos: Obj): Promise<void>;
  listar(tipo: string): Promise<Obj[]>;
  borrar(tipo: string, id: string): Promise<void>;
}

export class AlmacenMemoria implements AlmacenSim {
  readonly datos = new Map<string, Obj>();
  leer(tipo: string, id: string) {
    return Promise.resolve(structuredClone(this.datos.get(`${tipo}:${id}`) ?? null));
  }
  guardar(tipo: string, id: string, datos: Obj) {
    this.datos.set(`${tipo}:${id}`, structuredClone(datos));
    return Promise.resolve();
  }
  listar(tipo: string) {
    return Promise.resolve(
      [...this.datos.entries()]
        .filter(([k]) => k.startsWith(`${tipo}:`))
        .map(([, v]) => structuredClone(v)),
    );
  }
  borrar(tipo: string, id: string) {
    this.datos.delete(`${tipo}:${id}`);
    return Promise.resolve();
  }
}

/** Cliente mínimo de Supabase que usa el almacén (evita depender de supabase-js acá). */
type TablaSb = {
  from(t: string): {
    // deno-lint-ignore no-explicit-any
    select(c: string): any;
    // deno-lint-ignore no-explicit-any
    upsert(v: Obj): any;
    // deno-lint-ignore no-explicit-any
    delete(): any;
  };
};

/** Almacén sobre la tabla `cobre_simulador (tipo, id, datos)` (solo service role). */
export function almacenSupabase(sb: TablaSb): AlmacenSim {
  const t = () => sb.from("cobre_simulador");
  const fallar = (e: { message: string } | null) => {
    if (e) throw new Error(`Simulador de Cobre: ${e.message}`);
  };
  return {
    async leer(tipo, id) {
      const { data, error } = await t().select("datos").eq("tipo", tipo).eq("id", id).maybeSingle();
      fallar(error);
      return (data?.datos as Obj) ?? null;
    },
    async guardar(tipo, id, datos) {
      const { error } = await t().upsert({
        tipo,
        id,
        datos,
        actualizado_at: new Date().toISOString(),
      });
      fallar(error);
    },
    async listar(tipo) {
      const { data, error } = await t().select("datos").eq("tipo", tipo).order("creado_at");
      fallar(error);
      return ((data ?? []) as { datos: Obj }[]).map((r) => r.datos);
    },
    async borrar(tipo, id) {
      const { error } = await t().delete().eq("tipo", tipo).eq("id", id);
      fallar(error);
    },
  };
}

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const nuevoId = (prefijo: string) =>
  `${prefijo}_${Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => ID_CHARS[b % ID_CHARS.length]).join("")}`;

/** Agrega el dígito verificador a 17 dígitos (pesos 3, 7, 1 de la CLABE). */
export function conDigitoClabe(d17: string): string {
  const pesos = [3, 7, 1];
  const suma = [...d17].reduce((s, c, i) => s + ((Number(c) * pesos[i % 3]) % 10), 0);
  return d17 + String((10 - (suma % 10)) % 10);
}

const clabeAleatoria = (banco = "703") =>
  conDigitoClabe(
    banco + Array.from(crypto.getRandomValues(new Uint8Array(14)), (b) => b % 10).join(""),
  );

const iso = (ms: number) => new Date(ms).toISOString();

const resp = (status: number, cuerpo: unknown) =>
  new Response(cuerpo === null ? null : JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  });
const error = (codigo: string, description: string, status = 409) =>
  resp(status, { code: codigo, description });

const pagina = (items: Obj[], q: URLSearchParams) => {
  const size = Math.min(Number(q.get("page_size") ?? 50) || 50, 100);
  const num = Math.max(Number(q.get("page_number") ?? 1) || 1, 1);
  const contents = items.slice((num - 1) * size, num * size);
  const total_pages = Math.max(1, Math.ceil(items.length / size));
  return {
    total_items: items.length,
    total_pages,
    page_items: contents.length,
    page_size: size,
    page_number: num,
    is_last_page: num >= total_pages,
    contents,
  };
};

export type OpcionesSim = { ahora?: () => number };

/** `fetch` que atiende las rutas de Cobre contra el almacén. */
export function fetchSimulado(almacen: AlmacenSim, o: OpcionesSim = {}): typeof fetch {
  const ahora = o.ahora ?? Date.now;
  return async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
    const metodo = (init?.method ?? "GET").toUpperCase();
    const ruta = url.pathname.replace(/^\/v1/, "");
    const cabeceras = new Headers(init?.headers);
    const cuerpo = init?.body ? (JSON.parse(String(init.body)) as Obj) : {};
    const partes = ruta.split("/").filter(Boolean);

    if (ruta === "/auth" && metodo === "POST") {
      if (!cuerpo.user_id) return error("AU001", "No user_id", 400);
      if (!cuerpo.secret) return error("AU002", "No secret", 400);
      return resp(201, { access_token: nuevoId("tok"), type: "Bearer", expiration_time: 1200 });
    }
    if (!cabeceras.get("authorization")?.startsWith("Bearer "))
      return resp(401, { message: "Unauthorized" });

    await avanzarSimulador(almacen, ahora());

    // Cuentas (Cobre Balance MX)
    if (partes[0] === "accounts" && partes.length === 1) {
      if (metodo === "POST") {
        if (cuerpo.provider_id !== "pr_mex_cobre3")
          return error("ACC002", "Provider not available in the simulator");
        if (cuerpo.action !== "create") return error("ACC005", "Invalid action");
        const cuenta = {
          id: nuevoId("acc"),
          provider_id: "pr_mex_cobre3",
          provider_name: "Cobre Balance Mexico 3",
          connectivity: { status: "connected", description: "" },
          alias: String(cuerpo.alias ?? "").slice(0, 32),
          metadata: {
            available_services: ["account_balance", "mm_push_from_account", "account_transactions"],
          },
          currency: "mxn",
          geo: "mex",
          tags: cuerpo.tags ?? [],
          account_number: clabeAleatoria(),
          account_type: "clabe",
          obtained_balance: 0,
          obtained_balance_at: iso(ahora()),
          created_at: iso(ahora()),
          updated_at: iso(ahora()),
        };
        await almacen.guardar("cuenta", cuenta.id, cuenta);
        return resp(201, cuenta);
      }
      return resp(200, pagina(await almacen.listar("cuenta"), url.searchParams));
    }
    if (partes[0] === "accounts" && partes.length === 2 && metodo === "GET") {
      const c = await almacen.leer("cuenta", partes[1]);
      return c ? resp(200, c) : error("ACC006", "Account not found", 404);
    }
    if (partes[0] === "accounts" && partes[2] === "transactions" && metodo === "GET") {
      const trx = (await almacen.listar("transaccion")).filter((t) => t.account_id === partes[1]);
      return resp(200, pagina(trx.reverse(), url.searchParams));
    }

    // Referencias de cuenta (CLABEs virtuales)
    if (partes[0] === "account_references") {
      if (metodo === "POST" && partes.length === 1) {
        if (cuerpo.type !== "virtual_clabe_accounts")
          return error("AR001", "Only virtual_clabe_accounts is simulated");
        const cuenta = await almacen.leer("cuenta", String(cuerpo.source_id ?? ""));
        if (!cuenta) return error("AR002", "Invalid source_id");
        if (!cuerpo.alias) return error("AR003", "alias is required");
        const ref = {
          id: nuevoId("ref"),
          alias: String(cuerpo.alias).slice(0, 32),
          type: "virtual_clabe_accounts",
          value: clabeAleatoria(),
          source_id: cuenta.id,
          geo: "mex",
          connectivity: { status: "enabled", description: " " },
          metadata: {},
          created_at: iso(ahora()),
          updated_at: iso(ahora()),
        };
        await almacen.guardar("referencia", ref.id, ref);
        return resp(201, ref);
      }
      if (metodo === "GET" && partes.length === 1) {
        let refs = await almacen.listar("referencia");
        const src = url.searchParams.get("source_id");
        if (src) refs = refs.filter((r) => r.source_id === src);
        return resp(200, pagina(refs, url.searchParams));
      }
      const ref = await almacen.leer("referencia", partes[1] ?? "");
      if (!ref) return error("AR004", "Account reference not found", 404);
      if (metodo === "DELETE") {
        ref.connectivity = { status: "disabled", description: "deleted" };
        ref.updated_at = iso(ahora());
        await almacen.guardar("referencia", String(ref.id), ref);
        return resp(200, ref);
      }
      return resp(200, ref);
    }

    // Contrapartes
    if (partes[0] === "counterparties") {
      if (metodo === "POST" && partes.length === 1) {
        const meta = (cuerpo.metadata ?? {}) as Obj;
        if (cuerpo.geo !== "mex") return error("CP013", "Only geo mex is simulated");
        if (cuerpo.type !== "clabe" && cuerpo.type !== "spei_card")
          return error("CP002", "Invalid type");
        const numero = String(meta.account_number ?? meta.card_number ?? "");
        if (
          cuerpo.type === "clabe" &&
          (!/^\d{18}$/.test(numero) || conDigitoClabe(numero.slice(0, 17)) !== numero)
        ) {
          return error("CP003", "Invalid account_number");
        }
        if (!["rfc", "curp"].includes(String(meta.counterparty_id_type)))
          return error("CP005", "Invalid identification type");
        if (/[^A-Za-z0-9 ]/.test(String(meta.counterparty_fullname ?? "")))
          return error("CP006", "Special characters in fullname");
        const cp = {
          id: nuevoId("cp"),
          geo: "mex",
          type: cuerpo.type,
          alias: cuerpo.alias ?? "",
          metadata: meta,
          created_at: iso(ahora()),
          updated_at: iso(ahora()),
        };
        await almacen.guardar("contraparte", cp.id, cp);
        return resp(201, cp);
      }
      const cp = await almacen.leer("contraparte", partes[1] ?? "");
      if (!cp) return error("CP014", "Counterparty not found", 404);
      if (metodo === "DELETE") {
        await almacen.borrar("contraparte", String(cp.id));
        return resp(204, null);
      }
      return resp(200, cp);
    }

    // Transferencias (money movements)
    if (partes[0] === "money_movements" && partes.length === 1 && metodo === "POST") {
      const clave = cabeceras.get("idempotency") ?? "";
      if (!clave) return error("MM009", "Missing idempotency header", 400);
      if (clave.length < 9) return error("MM009", "idempotency must have at least 9 characters");
      const previo = await almacen.leer("idempotencia", clave);
      if (previo) return resp(201, (await almacen.leer("movimiento", String(previo.mm))) ?? previo);
      const cuenta = await almacen.leer("cuenta", String(cuerpo.source_id ?? ""));
      if (!cuenta) return error("MM021", "Invalid source_id");
      const cp = await almacen.leer("contraparte", String(cuerpo.destination_id ?? ""));
      if (!cp) return error("MM002", "Invalid destination_id");
      if (!Number.isInteger(cuerpo.amount) || Number(cuerpo.amount) <= 0)
        return error("MM003", "Invalid amount");
      const meta = (cuerpo.metadata ?? {}) as Obj;
      if (!/^\d+$/.test(String(meta.reference ?? "")))
        return error("MM013", "reference must be numeric");
      const aprobar = cuerpo.checker_approval === true;
      const mm = {
        id: nuevoId("mm"),
        status: { state: aprobar ? "pending_approval" : "initiated", code: "", description: "" },
        metadata: {
          description: meta.description ?? "",
          reference: meta.reference,
          tracking_key: "",
          cep_url: "",
        },
        creator: "cli_simulado",
        external_id: cuerpo.external_id ?? "",
        checker_approval: aprobar,
        mm_approval_id: aprobar ? nuevoId("mma") : "",
        type: "spei",
        geo: "mex",
        source_id: cuenta.id,
        destination_id: cp.id,
        currency: "mxn",
        amount: cuerpo.amount,
        created_at: iso(ahora()),
        updated_at: iso(ahora()),
        _ms: ahora(),
      };
      await almacen.guardar("movimiento", mm.id, mm);
      await almacen.guardar("idempotencia", clave, { mm: mm.id });
      await encolar(almacen, `money_movements.status.${mm.status.state}`, publico(mm), ahora());
      return resp(201, publico(mm));
    }
    if (partes[0] === "money_movements" && partes.length === 2 && metodo === "GET") {
      const mm = await almacen.leer("movimiento", partes[1]);
      return mm ? resp(200, publico(mm)) : error("MM012", "Money movement not found", 404);
    }
    if (partes[0] === "money_movements" && partes.length === 1 && metodo === "GET") {
      let mms = await almacen.listar("movimiento");
      const ext = url.searchParams.get("external_id");
      if (ext) mms = mms.filter((m) => m.external_id === ext);
      return resp(200, pagina(mms.map(publico).reverse(), url.searchParams));
    }
    if (partes[0] === "money_movements_return" && metodo === "POST") {
      return error("G005", "Returns are not simulated yet");
    }

    // Verificación de cuentas
    if (partes[0] === "account_verifications") {
      if (metodo === "POST" && partes.length === 1) {
        const numero = String(cuerpo.account_number ?? "");
        if (!/^\d{18}$/.test(numero) || conDigitoClabe(numero.slice(0, 17)) !== numero) {
          return error("AV003", "Invalid account_number");
        }
        const av = {
          id: nuevoId("av"),
          model: cuerpo.model,
          account_number: numero,
          status: "processing",
          verification_response: "",
          created_at: iso(ahora()),
          _ms: ahora(),
        };
        await almacen.guardar("verificacion", av.id, av);
        return resp(201, publico(av));
      }
      const av = await almacen.leer("verificacion", partes[1] ?? "");
      return av ? resp(200, publico(av)) : error("AV004", "Account verification not found", 404);
    }

    return error("G002", `Route not simulated: ${metodo} ${ruta}`, 404);
  };
}

/** Quita los campos internos del simulador (los que empiezan con `_`). */
const publico = (o: Obj): Obj =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("_")));

async function encolar(almacen: AlmacenSim, evento: string, contenido: Obj, ms: number) {
  const id = nuevoId("ev");
  await almacen.guardar("evento", id, {
    id,
    pendiente: true,
    cuerpo: { id, event_key: evento, created_at: iso(ms), content: contenido },
  });
}

async function movimientoSaldo(
  almacen: AlmacenSim,
  cuentaId: string,
  centavos: number,
  tipo: string,
  metadata: Obj,
  ms: number,
): Promise<Obj | null> {
  const cuenta = await almacen.leer("cuenta", cuentaId);
  if (!cuenta) return null;
  const previo = Number(cuenta.obtained_balance ?? 0);
  cuenta.obtained_balance = previo + centavos;
  cuenta.obtained_balance_at = iso(ms);
  await almacen.guardar("cuenta", cuentaId, cuenta);
  const trx = {
    id: nuevoId("trx"),
    type: tipo,
    amount: centavos,
    currency: "mxn",
    date: iso(ms),
    metadata,
    account_id: cuentaId,
    previous_balance: previo,
    current_balance: previo + centavos,
    credit_debit_type: centavos >= 0 ? "credit" : "debit",
  };
  await almacen.guardar("transaccion", trx.id, trx);
  await encolar(
    almacen,
    centavos >= 0 ? "accounts.balance.credit" : "accounts.balance.debit",
    trx,
    ms,
  );
  return trx;
}

/** Hace avanzar transferencias y verificaciones según el tiempo transcurrido. */
export async function avanzarSimulador(almacen: AlmacenSim, ms: number): Promise<void> {
  for (const mm of await almacen.listar("movimiento")) {
    const st = mm.status as Obj;
    const edad = ms - Number(mm._ms ?? 0);
    const cambiar = async (state: string, code = "", description = "") => {
      mm.status = { state, code, description };
      mm.updated_at = iso(ms);
      mm._ms = ms;
      await almacen.guardar("movimiento", String(mm.id), mm);
      await encolar(almacen, `money_movements.status.${state}`, publico(mm), ms);
    };
    if (st.state === "initiated" && edad >= 1000) {
      const cuenta = await almacen.leer("cuenta", String(mm.source_id));
      if (!cuenta || Number(cuenta.obtained_balance ?? 0) < Number(mm.amount)) {
        await cambiar("failed", "F002", "NSF - Not Sufficient Funds in the designated account");
        continue;
      }
      const rastreo = `SIM${String(ms).slice(-10)}`;
      mm.metadata = { ...(mm.metadata as Obj), tracking_key: rastreo };
      await movimientoSaldo(
        almacen,
        String(mm.source_id),
        -Number(mm.amount),
        "spei_debit",
        {
          money_movement_id: mm.id,
          mm_external_id: mm.external_id,
          tracking_key: rastreo,
        },
        ms,
      );
      await cambiar("processing");
    } else if (st.state === "processing" && edad >= 4000) {
      const cp = await almacen.leer("contraparte", String(mm.destination_id));
      const titular = String(((cp?.metadata ?? {}) as Obj).counterparty_fullname ?? "");
      if (/RECHAZO/i.test(titular)) {
        await movimientoSaldo(
          almacen,
          String(mm.source_id),
          Number(mm.amount),
          "spei_rejected",
          {
            money_movement_id: mm.id,
            mm_external_id: mm.external_id,
            tracking_key: (mm.metadata as Obj).tracking_key,
          },
          ms,
        );
        await cambiar("rejected", "R005", "Account does not exist");
      } else {
        mm.metadata = {
          ...(mm.metadata as Obj),
          cep_url: `https://www.banxico.org.mx/cep/simulado/${mm.id}`,
        };
        await cambiar("completed");
      }
    }
  }
  for (const av of await almacen.listar("verificacion")) {
    if (av.status !== "processing" || ms - Number(av._ms ?? 0) < 5000) continue;
    const n = String(av.account_number);
    av.status = "completed";
    av.verification_response = /0000\d$/.test(n)
      ? "unmatched"
      : /1111\d$/.test(n)
        ? "unresolved"
        : "matched";
    await almacen.guardar("verificacion", String(av.id), av);
  }
}

/** Aprueba o cancela una transferencia en `pending_approval` (en Cobre lo hace el aprobador). */
export async function decidirAprobacionSimulada(
  almacen: AlmacenSim,
  mmId: string,
  aprobar: boolean,
  ms = Date.now(),
): Promise<Obj | null> {
  const mm = await almacen.leer("movimiento", mmId);
  if (!mm || (mm.status as Obj).state !== "pending_approval") return null;
  mm.status = { state: aprobar ? "initiated" : "canceled", code: "", description: "" };
  mm.updated_at = iso(ms);
  mm._ms = ms;
  await almacen.guardar("movimiento", mmId, mm);
  await encolar(
    almacen,
    `money_movements.status.${aprobar ? "initiated" : "canceled"}`,
    publico(mm),
    ms,
  );
  return publico(mm);
}

/** Simula un depósito SPEI a una CLABE (de una cuenta o virtual). */
export async function depositoSimulado(
  almacen: AlmacenSim,
  d: { clabe: string; monto: number; remitente?: string; concepto?: string },
  ms = Date.now(),
): Promise<Obj> {
  const refs = await almacen.listar("referencia");
  const ref = refs.find(
    (r) => r.value === d.clabe && (r.connectivity as Obj)?.status === "enabled",
  );
  const cuentas = await almacen.listar("cuenta");
  const cuenta = ref
    ? cuentas.find((c) => c.id === ref.source_id)
    : cuentas.find((c) => c.account_number === d.clabe);
  if (!cuenta)
    throw new Error("La CLABE no pertenece a ninguna cuenta simulada (o está deshabilitada)");
  if (!(d.monto > 0)) throw new Error("Monto inválido");
  const trx = await movimientoSaldo(
    almacen,
    String(cuenta.id),
    Math.round(d.monto * 100),
    "spei_credit",
    {
      intended_beneficiary_id: "N/A",
      reference: "1234567",
      intended_beneficiary_name: String(cuenta.alias ?? ""),
      sender_account_number: clabeAleatoria("012"),
      description: d.concepto ?? "Depósito simulado",
      sender_name: d.remitente ?? "REMITENTE SIMULADO",
      tracking_key: `SIMDEP${String(ms).slice(-10)}`,
      sender_id: "XAXX010101000",
      account_reference: d.clabe,
      cep: "https://www.banxico.org.mx/cep/simulado",
    },
    ms,
  );
  return trx as Obj;
}

/** Eventos en cola (sin enviar) y marca de enviado. */
export async function eventosPendientes(almacen: AlmacenSim): Promise<Obj[]> {
  return (await almacen.listar("evento")).filter((e) => e.pendiente === true);
}

export async function marcarEventoEnviado(almacen: AlmacenSim, e: Obj, resultado: string) {
  await almacen.guardar("evento", String(e.id), { ...e, pendiente: false, resultado });
}
