// Simulador de Cobre (modo `simulado`): mientras no haya instancia de prueba de Cobre para
// México, responde los mismos endpoints con los formatos del Solution Design de JPAY y del OAS,
// sobre un almacén propio (tabla `cobre_simulador` o memoria en los tests). Se enchufa como
// `fetch` del CobreCliente.
//
// Reglas de la simulación (para probar los caminos felices y los de error):
// - Subcliente: `processing` → (5 s) `approved`; si `legal_name` contiene "RECHAZO" → `rejected`.
//   El Balance México exige un Subcliente aprobado.
// - SPEI: `initiated` → (1 s) `processing` (debita) → (4 s) `completed`. Sin saldo → `failed`
//   F002. Titular con "RECHAZO" → `rejected` R005 y reintegro (`spei_rejected`). Titular con
//   "REBOTE" → `completed` y, 3 s después, un crédito `spei_rejected` (rebote posterior).
// - Verificación de CLABE: a los 5 s `matched`; CLABE terminada en 0000X → `unmatched`,
//   en 1111X → `unresolved` (X = dígito verificador).
// - R2P: CLABE dinámica en `metadata.virtual_account`; queda `initiated` hasta que se paga
//   (`pagarR2pSimulado`) o vence (`rejected` F003).
// - Lote: `validating` → (1 s) `processing` (crea un SPEI por ítem con `batch_id`) → `completed`.
// - Cotización `static_quote` mxn/usd: tasa 0.054 USD por MXN, vale 25 s. Cross Border:
//   `initiated` → (1 s) `processing` → (3 s) `completed` (`cbmm_debit` / `cbmm_credit`); sin
//   fondos → `failed` F002.
// - Traslado Global → USA (`global_pay_to_usa`): completa en 2 s.
// - Beneficiario `business`: `processing` → (5 s) `Verified` ("RECHAZO" en el nombre → `Rejected`).
//   Fedwire/SWIFT: `initiated` → (1 s) `processing` (debita) → (4 s) `completed`; un SWIFT a un
//   beneficiario con "FALLA" termina `failed` y el USD vuelve al Balance USA.
// - Cada cambio deja un evento en cola que `cobre-simulador` firma y envía a `cobre-webhook`.
//
// Archivo compartido: es idéntico en los repos del panel admin y del portal empresas (`npm run shared:check`).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

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

/** Almacén sobre la tabla `cobre_simulador (tipo, id, datos)` (solo service role). */
export function almacenSupabase(sb: SupabaseClient): AlmacenSim {
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
  const size = Math.min(Number(q.get("page_size") ?? 50) || 50, 1000);
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

/** Tasa simulada del par mxn/usd (dólares por peso). */
export const TASA_SIMULADA_MXN_USD = 0.054;

export type OpcionesSim = { ahora?: () => number };

/** `fetch` que atiende las rutas de Cobre contra el almacén. */
export function fetchSimulado(almacen: AlmacenSim, o: OpcionesSim = {}): typeof fetch {
  const ahora = o.ahora ?? Date.now;
  return async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
    const metodo = (init?.method ?? "GET").toUpperCase();
    const ruta = url.pathname.replace(/^\/v1/, "");
    const cabeceras = new Headers(init?.headers);
    const archivo = init?.body instanceof FormData ? init.body.get("file") : null;
    const cuerpo =
      init?.body && !(init.body instanceof FormData) ? (JSON.parse(String(init.body)) as Obj) : {};
    const partes = ruta.split("/").filter(Boolean);

    if (ruta === "/auth" && metodo === "POST") {
      if (!cuerpo.user_id) return error("AU001", "No user_id", 400);
      if (!cuerpo.secret) return error("AU002", "No secret", 400);
      return resp(201, { access_token: nuevoId("tok"), type: "Bearer", expiration_time: 1200 });
    }
    if (!cabeceras.get("authorization")?.startsWith("Bearer "))
      return resp(401, { message: "Unauthorized" });

    await avanzarSimulador(almacen, ahora());

    // Suscripciones de avisos
    if (partes[0] === "subscriptions") {
      if (metodo === "POST") {
        if (!cuerpo.url || !Array.isArray(cuerpo.events))
          return error("SUB001", "url and events are required", 400);
        const clave = String(cuerpo.event_signature_key ?? "");
        const sub = {
          id: nuevoId("sub"),
          url: cuerpo.url,
          description: cuerpo.description ?? "",
          events: cuerpo.events,
          event_signature_key: clave ? `******${clave.slice(-4)}` : "",
          created_at: iso(ahora()),
        };
        await almacen.guardar("suscripcion", sub.id, sub);
        return resp(201, sub);
      }
      return resp(200, pagina(await almacen.listar("suscripcion"), url.searchParams));
    }

    // Subclientes (KYB del comercio)
    if (partes[0] === "subclients") {
      if (metodo === "POST" && partes.length === 1) {
        const clave = cabeceras.get("idempotency-key") ?? "";
        if (clave.length < 9)
          return error("SC001", "Idempotency-Key must have at least 9 characters", 400);
        const previo = await almacen.leer("idem_subcliente", clave);
        if (previo)
          return resp(201, publico((await almacen.leer("subcliente", String(previo.sc)))!));
        for (const k of [
          "legal_name",
          "short_name",
          "id_number",
          "email",
          "phone",
          "industry",
          "country_of_operation",
        ]) {
          if (!cuerpo[k]) return error("SC002", `${k} is required`, 400);
        }
        const sc = {
          id: nuevoId("sc"),
          object: "subclient",
          status: { state: "processing" },
          ...cuerpo,
          created_at: iso(ahora()),
          updated_at: iso(ahora()),
          _ms: ahora(),
        };
        await almacen.guardar("subcliente", sc.id, sc);
        await almacen.guardar("idem_subcliente", clave, { sc: sc.id });
        await encolar(almacen, "subclient.status.processing", avisoSubcliente(sc), ahora());
        return resp(201, publico(sc));
      }
      const sc = await almacen.leer("subcliente", partes[1] ?? "");
      return sc ? resp(200, publico(sc)) : error("SC004", "Subclient not found", 404);
    }

    // Cuentas (Cobre Balances)
    if (partes[0] === "accounts" && partes.length === 1) {
      if (metodo === "POST") {
        if (cuerpo.action !== "create") return error("ACC005", "Invalid action");
        const proveedor = String(cuerpo.provider_id ?? "");
        if (!["pr_mex_cobre3", "pr_global_cobre", "pr_usa_cobre"].includes(proveedor))
          return error("ACC002", "Provider not available in the simulator");
        if (proveedor === "pr_mex_cobre3" && cuerpo.subclient_id !== undefined) {
          const sc = await almacen.leer("subcliente", String(cuerpo.subclient_id));
          if (!sc) return error("ACC010", "subclient_id not found");
          if ((sc.status as Obj).state !== "approved")
            return error("ACC011", "The subclient is not approved");
        }
        if (proveedor === "pr_global_cobre" && ((cuerpo.metadata ?? {}) as Obj).currency !== "usd")
          return error("ACC012", "metadata.currency is required for pr_global_cobre");
        const mx = proveedor === "pr_mex_cobre3";
        const cuenta = {
          id: nuevoId("acc"),
          provider_id: proveedor,
          provider_name: mx
            ? "Cobre Balance Mexico 3"
            : proveedor === "pr_usa_cobre"
              ? "Cobre Balance USA"
              : "Cobre Balance Global",
          connectivity: { status: "connected", description: "" },
          alias: String(cuerpo.alias ?? "").slice(0, 32),
          metadata: {
            available_services: ["account_balance", "mm_push_from_account", "account_transactions"],
            ...(mx ? {} : { cobre_tag: `@sim${String(ahora()).slice(-5)}` }),
          },
          currency: mx ? "mxn" : "usd",
          geo: mx ? "mex" : proveedor === "pr_usa_cobre" ? "usa" : "global",
          tags: cuerpo.tags ?? [],
          account_number: mx ? clabeAleatoria() : null,
          account_type: mx ? "clabe" : "cobre_balance",
          obtained_balance: 0,
          obtained_balance_at: iso(ahora()),
          created_at: iso(ahora()),
          updated_at: iso(ahora()),
          ...(cuerpo.subclient_id ? { _subcliente: cuerpo.subclient_id } : {}),
        };
        await almacen.guardar("cuenta", cuenta.id, cuenta);
        return resp(201, publico(cuenta));
      }
      return resp(200, pagina((await almacen.listar("cuenta")).map(publico), url.searchParams));
    }
    if (partes[0] === "accounts" && partes.length === 2 && metodo === "GET") {
      const c = await almacen.leer("cuenta", partes[1]);
      return c ? resp(200, publico(c)) : error("ACC006", "Account not found", 404);
    }
    if (partes[0] === "accounts" && partes[2] === "transactions" && metodo === "GET") {
      const trx = (await almacen.listar("transaccion")).filter((t) => t.account_id === partes[1]);
      return resp(200, pagina(trx.reverse(), url.searchParams));
    }

    // Referencias de cuenta (CLABEs virtuales del modelo anterior)
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
      const ref = await almacen.leer("referencia", partes[1] ?? "");
      if (!ref) return error("AR004", "Account reference not found", 404);
      if (metodo === "DELETE") {
        ref.connectivity = { status: "disabled", description: "deleted" };
        await almacen.guardar("referencia", String(ref.id), ref);
      }
      return resp(200, ref);
    }

    // Contrapartes
    if (partes[0] === "counterparties") {
      if (metodo === "POST" && partes.length === 1) {
        const r = await crearContraparte(almacen, cuerpo, ahora());
        return r instanceof Response ? r : resp(201, publico(r));
      }
      const cp = await almacen.leer("contraparte", partes[1] ?? "");
      if (!cp) return error("CP014", "Counterparty not found", 404);
      if (metodo === "DELETE") {
        await almacen.borrar("contraparte", String(cp.id));
        return resp(204, null);
      }
      return resp(200, publico(cp));
    }

    // Money movements (SPEI, R2P, traslado Global→USA, Fedwire, SWIFT)
    if (partes[0] === "money_movements" && partes.length === 1 && metodo === "POST") {
      const r = await crearMovimiento(
        almacen,
        cuerpo,
        cabeceras.get("idempotency") ?? "",
        null,
        ahora(),
      );
      return r instanceof Response ? r : resp(201, publico(r));
    }
    if (partes[0] === "money_movements" && partes.length === 2 && metodo === "GET") {
      const mm = await almacen.leer("movimiento", partes[1]);
      return mm ? resp(200, publico(mm)) : error("MM012", "Money movement not found", 404);
    }
    if (partes[0] === "money_movements" && partes.length === 1 && metodo === "GET") {
      let mms = await almacen.listar("movimiento");
      for (const k of ["external_id", "batch_id", "type", "source_id", "destination_id"]) {
        const v = url.searchParams.get(k);
        if (v) mms = mms.filter((m) => m[k] === v);
      }
      return resp(200, pagina(mms.map(publico).reverse(), url.searchParams));
    }
    if (partes[0] === "money_movement_approvals" && partes[2] === "decision" && metodo === "POST") {
      if (cuerpo.decision !== "approved" && cuerpo.decision !== "denied")
        return error("MMA001", "Invalid decision");
      const mm = (await almacen.listar("movimiento")).find((m) => m.mm_approval_id === partes[1]);
      if (!mm) return error("MMA003", "Approval not found", 404);
      const r = await decidirAprobacionSimulada(
        almacen,
        String(mm.id),
        cuerpo.decision === "approved",
        ahora(),
      );
      if (!r) return error("MMA004", "The approval was already decided");
      return resp(200, { id: partes[1], decision: cuerpo.decision, money_movement_id: mm.id });
    }
    if (partes[0] === "money_movements_return" && metodo === "POST") {
      const trx = await almacen.leer("transaccion", String(cuerpo.transaction_id ?? ""));
      if (!trx || trx.type !== "spei_credit")
        return error("MMR001", "Only spei_credit transactions can be returned");
      if (!((cuerpo.metadata ?? {}) as Obj).description)
        return error("MMR002", "metadata.description is required");
      const ya = (await almacen.listar("movimiento")).find(
        (m) => m.type === "spei_return" && m.external_id === trx.id,
      );
      if (ya) return error("MMR003", "The transaction was already returned");
      const meta = (trx.metadata ?? {}) as Obj;
      const cp = {
        id: nuevoId("cp"),
        geo: "mex",
        type: "mm_return",
        alias: "",
        metadata: {
          account_number: meta.sender_account_number,
          counterparty_fullname: meta.sender_name,
          counterparty_id_type: "rfc",
          counterparty_id_number: meta.sender_id,
        },
        created_at: iso(ahora()),
        updated_at: iso(ahora()),
      };
      await almacen.guardar("contraparte", cp.id, cp);
      const mm = nuevoMovimiento({
        type: "spei_return",
        source: String(trx.account_id),
        destination: cp.id,
        amount: Number(trx.amount),
        currency: "mxn",
        externalId: String(trx.id),
        metadata: {
          description: ((cuerpo.metadata ?? {}) as Obj).description,
          reference: "0000000",
          tracking_key: "",
          cep_url: "",
        },
        ms: ahora(),
      });
      await almacen.guardar("movimiento", mm.id as string, mm);
      await encolar(almacen, "money_movements.status.initiated", publico(mm), ahora());
      return resp(201, publico(mm));
    }

    // Lotes
    if (partes[0] === "bulk_money_movements") {
      if (metodo === "POST" && partes.length === 1) {
        if (!(archivo instanceof File))
          return error("BMM001", "file is required (multipart/form-data)", 400);
        let items: unknown;
        try {
          items = JSON.parse(await archivo.text());
        } catch {
          return error("BMM002", "The file is not valid JSON", 400);
        }
        if (!Array.isArray(items) || !items.length)
          return error("BMM003", "The file must be a non-empty array", 400);
        const bat = {
          id: nuevoId("bat"),
          input_filename: archivo.name,
          status: { state: "validating", code: "", description: "" },
          total_money_movements: items.length,
          total_amount: (items as Obj[]).reduce((s, i) => s + Number(i.amount ?? 0), 0),
          checker_approval: false,
          checker_approval_decision: null,
          creator: "cli_simulado",
          created_at: iso(ahora()),
          executed_at: iso(ahora()),
          processed_at: "",
          _items: items,
          _ms: ahora(),
        };
        await almacen.guardar("lote", bat.id, bat);
        await encolar(almacen, "bulk_money_movements.status.validating", publico(bat), ahora());
        return resp(201, publico(bat));
      }
      const bat = await almacen.leer("lote", partes[1] ?? "");
      return bat ? resp(200, publico(bat)) : error("BMM004", "Bulk not found", 404);
    }

    // Cotizaciones y Cross Border
    if (partes[0] === "fx_quotes" && metodo === "POST") {
      if (cuerpo.currency_pair !== "mxn/usd") return error("FX001", "Only mxn/usd is simulated");
      if (cuerpo.type !== "static_quote") return error("FX002", "Only static_quote is simulated");
      const origen = Number(cuerpo.source_amount);
      if (!Number.isInteger(origen) || origen <= 0) return error("FX003", "Invalid source_amount");
      const h = (new Date(ahora()).getUTCHours() + 19) % 24;
      const q = {
        id: nuevoId("fxq"),
        type: "static_quote",
        currency_pair: "mxn/usd",
        source_amount: origen,
        fees_breakdown: { spread: 1.5 },
        fx_rate: TASA_SIMULADA_MXN_USD,
        destination_amount: Math.floor(origen * TASA_SIMULADA_MXN_USD),
        quota_limit: 100_000_000,
        remaining_quota: 100_000_000 - origen,
        created_at: iso(ahora()),
        valid_until: iso(ahora() + 25_000),
        last_quote: true,
        off_market: h < 5 || h >= 16,
      };
      for (const previa of await almacen.listar("cotizacion")) {
        if (previa.last_quote)
          await almacen.guardar("cotizacion", String(previa.id), { ...previa, last_quote: false });
      }
      await almacen.guardar("cotizacion", q.id, q);
      return resp(201, q);
    }
    if (partes[0] === "cross_border_money_movements") {
      if (metodo === "POST" && partes.length === 1) {
        const clave = cabeceras.get("idempotency") ?? "";
        if (clave.length < 9)
          return error("MM009", "idempotency must have at least 9 characters", 400);
        const previo = await almacen.leer("idempotencia", clave);
        if (previo)
          return resp(201, publico((await almacen.leer("movimiento", String(previo.mm)))!));
        const q = await almacen.leer("cotizacion", String(cuerpo.forex_quote_id ?? ""));
        if (!q) return error("CBMM001", "forex_quote_id not found");
        if (!q.last_quote) return error("CBMM002", "Only the latest quote can be used");
        if (Date.parse(String(q.valid_until)) <= ahora())
          return error("CBMM003", "The quote has expired");
        const src = await almacen.leer("cuenta", String(cuerpo.source_id ?? ""));
        const dst = await almacen.leer("cuenta", String(cuerpo.destination_id ?? ""));
        if (!src || src.provider_id !== "pr_mex_cobre3")
          return error("CBMM004", "Invalid source_id");
        if (!dst || dst.provider_id !== "pr_global_cobre")
          return error("CBMM005", "Invalid destination_id");
        const mm: Obj = {
          ...nuevoMovimiento({
            type: "cross_border",
            source: String(src.id),
            destination: String(dst.id),
            amount: Number(q.source_amount),
            currency: "mxn/usd",
            externalId: String(cuerpo.external_id ?? ""),
            metadata: { ...((cuerpo.metadata ?? {}) as Obj), forex_quote_id: q.id, forex_quote: q },
            ms: ahora(),
          }),
          _destino: Number(q.destination_amount),
        };
        await almacen.guardar("movimiento", mm.id as string, mm);
        await almacen.guardar("idempotencia", clave, { mm: mm.id });
        await encolar(
          almacen,
          "cross_border_money_movements.status.initiated",
          publico(mm),
          ahora(),
        );
        return resp(201, publico(mm));
      }
      const mm = await almacen.leer("movimiento", partes[1] ?? "");
      return mm && mm.type === "cross_border"
        ? resp(200, publico(mm))
        : error("CBMM006", "Not found", 404);
    }

    // Verificación de cuentas
    if (partes[0] === "account_verifications") {
      if (metodo === "POST" && partes.length === 1) {
        const pedido = (cuerpo.verification_request ?? cuerpo) as Obj;
        const numero = String(pedido.account_number ?? "");
        if (!/^\d{18}$/.test(numero) || conDigitoClabe(numero.slice(0, 17)) !== numero) {
          return error("AV003", "Invalid account_number");
        }
        const av = {
          id: nuevoId("av"),
          creator_id: "cli_simulado",
          model: cuerpo.model,
          geo: "mex",
          verification_request: pedido,
          verification_response: { verification_result: "" },
          status: { state: "processing", code: "-", description: "-" },
          external_id: cuerpo.external_id ?? "",
          created_at: iso(ahora()),
          updated_at: iso(ahora()),
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

/** El aviso de Subcliente publica `status` como cadena (la API, `status.state`). */
const avisoSubcliente = (sc: Obj): Obj => ({
  ...publico(sc),
  status: (sc.status as Obj).state,
});

async function encolar(almacen: AlmacenSim, evento: string, contenido: Obj, ms: number) {
  const id = nuevoId("ev");
  await almacen.guardar("evento", id, {
    id,
    pendiente: true,
    cuerpo: { id, event_key: evento, created_at: iso(ms), content: contenido },
  });
}

function nuevoMovimiento(o: {
  type: string;
  source: string;
  destination: string;
  amount: number;
  currency: string;
  externalId: string;
  metadata: Obj;
  ms: number;
  aprobar?: boolean;
  batchId?: string;
}): Obj {
  return {
    id: nuevoId("mm"),
    batch_id: o.batchId ?? "",
    status: { state: o.aprobar ? "pending_approval" : "initiated", code: "", description: "" },
    metadata: o.metadata,
    creator: "cli_simulado",
    external_id: o.externalId,
    checker_approval: o.aprobar === true,
    mm_approval_id: o.aprobar ? nuevoId("mma") : "",
    type: o.type,
    geo:
      o.type === "fedwire" || o.type === "swift" || o.type === "global_pay_to_usa" ? "usa" : "mex",
    source_id: o.source,
    destination_id: o.destination,
    currency: o.currency,
    amount: o.amount,
    created_at: iso(o.ms),
    updated_at: iso(o.ms),
    _ms: o.ms,
  };
}

async function crearContraparte(
  almacen: AlmacenSim,
  cuerpo: Obj,
  ms: number,
): Promise<Obj | Response> {
  const meta = (cuerpo.metadata ?? {}) as Obj;
  const tipo = String(cuerpo.type ?? "");
  if (tipo === "business") {
    const bank = (meta.counterparty_bank_details ?? {}) as Obj;
    if (bank.rail !== "fedwire" && bank.rail !== "swift") return error("CP020", "Invalid rail");
    if (!meta.counterparty_incorporation_country)
      return error("CP021", "counterparty_incorporation_country is required");
    if (bank.rail === "fedwire" && !/^\d{9}$/.test(String(bank.routing_number ?? "")))
      return error("CP022", "Invalid routing_number");
    if (bank.rail === "swift" && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(String(bank.bic ?? "")))
      return error("CP023", "Invalid bic");
    const cp = {
      id: nuevoId("cp"),
      geo: cuerpo.geo,
      type: "business",
      alias: cuerpo.alias ?? "",
      metadata: {
        ...meta,
        counterparty_verification_status: "processing",
        counterparty_verification_code: "",
        counterparty_verification_description: "",
      },
      created_at: iso(ms),
      updated_at: iso(ms),
      _ms: ms,
    };
    await almacen.guardar("contraparte", cp.id, cp);
    return cp;
  }
  if (cuerpo.geo !== "mex") return error("CP013", "Only geo mex is simulated for this type");
  if (!["clabe", "spei_card", "r2p_spei"].includes(tipo)) return error("CP002", "Invalid type");
  if (tipo !== "r2p_spei") {
    const numero = String(meta.account_number ?? meta.card_number ?? "");
    if (
      tipo === "clabe" &&
      (!/^\d{18}$/.test(numero) || conDigitoClabe(numero.slice(0, 17)) !== numero)
    ) {
      return error("CP003", "Invalid account_number");
    }
  }
  if (!["rfc", "curp"].includes(String(meta.counterparty_id_type).toLowerCase()))
    return error("CP005", "Invalid identification type");
  if (/[^A-Za-z0-9 ]/.test(String(meta.counterparty_fullname ?? "")))
    return error("CP006", "Special characters in fullname");
  const cp = {
    id: nuevoId("cp"),
    geo: "mex",
    type: tipo,
    alias: cuerpo.alias ?? "",
    metadata: meta,
    created_at: iso(ms),
    updated_at: iso(ms),
  };
  await almacen.guardar("contraparte", cp.id, cp);
  return cp;
}

/** POST /money_movements (y cada ítem de un lote). El tipo sale del origen y el destino. */
async function crearMovimiento(
  almacen: AlmacenSim,
  cuerpo: Obj,
  clave: string,
  batchId: string | null,
  ms: number,
): Promise<Obj | Response> {
  if (!batchId) {
    if (!clave) return error("MM009", "Missing idempotency header", 400);
    if (clave.length < 9) return error("MM009", "idempotency must have at least 9 characters");
    const previo = await almacen.leer("idempotencia", clave);
    if (previo) return (await almacen.leer("movimiento", String(previo.mm))) ?? previo;
  }
  if (!Number.isInteger(cuerpo.amount) || Number(cuerpo.amount) <= 0)
    return error("MM003", "Invalid amount");
  const meta = (cuerpo.metadata ?? {}) as Obj;
  const ext = String(cuerpo.external_id ?? "");
  const src = String(cuerpo.source_id ?? "");
  const dst = String(cuerpo.destination_id ?? "");
  const cuentaOrigen = await almacen.leer("cuenta", src);
  const cpOrigen = cuentaOrigen ? null : await almacen.leer("contraparte", src);
  const cuentaDestino = await almacen.leer("cuenta", dst);
  const cpDestino = cuentaDestino ? null : await almacen.leer("contraparte", dst);
  let mm: Obj;

  if (cpOrigen?.type === "r2p_spei") {
    if (!cuentaDestino || cuentaDestino.provider_id !== "pr_mex_cobre3")
      return error("MM002", "Invalid destination_id");
    if (meta.r2p_rail !== "spei") return error("MM030", "metadata.r2p_rail must be spei");
    const vence =
      typeof meta.valid_until === "string" ? Date.parse(meta.valid_until) : ms + 5 * 60_000;
    if (!(vence > ms)) return error("MM031", "valid_until must be in the future");
    mm = nuevoMovimiento({
      type: "r2p_spei",
      source: src,
      destination: dst,
      amount: Number(cuerpo.amount),
      currency: "mxn",
      externalId: ext,
      metadata: {
        virtual_account: clabeAleatoria("703"),
        tracking_key: "",
        description_to_payer: meta.description_to_payer ?? "",
        description_to_payee: meta.description_to_payee ?? "",
        valid_until: iso(vence),
        r2p_rail: "spei",
      },
      ms,
    });
  } else if (
    cuentaOrigen?.provider_id === "pr_global_cobre" &&
    cuentaDestino?.provider_id === "pr_usa_cobre"
  ) {
    if (cuerpo.type) return error("MM040", "type must not be sent for global_pay_to_usa");
    mm = nuevoMovimiento({
      type: "global_pay_to_usa",
      source: src,
      destination: dst,
      amount: Number(cuerpo.amount),
      currency: "usd",
      externalId: ext,
      metadata: { description: meta.description ?? "", category: "" },
      ms,
    });
  } else if (cuentaOrigen?.provider_id === "pr_usa_cobre" && cpDestino?.type === "business") {
    const bank = ((cpDestino.metadata as Obj).counterparty_bank_details ?? {}) as Obj;
    if ((cpDestino.metadata as Obj).counterparty_verification_status !== "Verified")
      return error("MM041", "The counterparty is not verified");
    if (Number(cuerpo.amount) < 100) return error("MM042", "Minimum amount is 1.00 USD");
    mm = nuevoMovimiento({
      type: String(bank.rail),
      source: src,
      destination: dst,
      amount: Number(cuerpo.amount),
      currency: "usd",
      externalId: ext,
      metadata: { description: meta.description ?? "", category: meta.category ?? "" },
      ms,
      aprobar: cuerpo.checker_approval === true,
    });
  } else {
    if (!cuentaOrigen || cuentaOrigen.provider_id !== "pr_mex_cobre3")
      return error("MM021", "Invalid source_id");
    if (!cpDestino || !["clabe", "spei_card"].includes(String(cpDestino.type)))
      return error("MM002", "Invalid destination_id");
    if (!/^\d+$/.test(String(meta.reference ?? "")))
      return error("MM013", "reference must be numeric");
    mm = nuevoMovimiento({
      type: "spei",
      source: src,
      destination: dst,
      amount: Number(cuerpo.amount),
      currency: "mxn",
      externalId: ext,
      metadata: {
        description: meta.description ?? "",
        reference: meta.reference,
        tracking_key: "",
        cep_url: "",
      },
      ms,
      aprobar: cuerpo.checker_approval === true,
      batchId: batchId ?? undefined,
    });
  }
  await almacen.guardar("movimiento", String(mm.id), mm);
  if (!batchId) await almacen.guardar("idempotencia", clave, { mm: mm.id });
  await encolar(almacen, `money_movements.status.${(mm.status as Obj).state}`, publico(mm), ms);
  return mm;
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
    currency: cuenta.currency ?? "mxn",
    date: iso(ms),
    operation_date: iso(ms),
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

/** Hace avanzar todo lo que el simulador tiene en curso según el tiempo transcurrido. */
export async function avanzarSimulador(almacen: AlmacenSim, ms: number): Promise<void> {
  // Subclientes
  for (const sc of await almacen.listar("subcliente")) {
    if ((sc.status as Obj).state !== "processing" || ms - Number(sc._ms ?? 0) < 5000) continue;
    const rechazo = /RECHAZO/i.test(String(sc.legal_name ?? ""));
    sc.status = {
      state: rechazo ? "rejected" : "approved",
      ...(rechazo ? { description: "KYB rejected" } : {}),
    };
    sc.updated_at = iso(ms);
    await almacen.guardar("subcliente", String(sc.id), sc);
    await encolar(
      almacen,
      `subclient.status.${rechazo ? "rejected" : "approved"}`,
      avisoSubcliente(sc),
      ms,
    );
  }

  // Lotes
  for (const bat of await almacen.listar("lote")) {
    const st = bat.status as Obj;
    if (st.state !== "validating" || ms - Number(bat._ms ?? 0) < 1000) continue;
    const cambiar = async (state: string, description = "") => {
      bat.status = { state, code: "", description };
      bat._ms = ms;
      await almacen.guardar("lote", String(bat.id), bat);
      await encolar(almacen, `bulk_money_movements.status.${state}`, publico(bat), ms);
    };
    const items = (bat._items ?? []) as Obj[];
    if (items.some((i) => i.type && i.type !== "spei")) {
      await cambiar("failed", "Only one type per file");
      continue;
    }
    await cambiar("processing");
    for (const it of items) {
      await crearMovimiento(almacen, it, "", String(bat.id), ms);
    }
    bat.processed_at = iso(ms);
    await cambiar("completed");
  }

  // Beneficiarios business: verificación
  for (const cp of await almacen.listar("contraparte")) {
    const meta = (cp.metadata ?? {}) as Obj;
    if (cp.type !== "business" || meta.counterparty_verification_status !== "processing") continue;
    if (ms - Number(cp._ms ?? 0) < 5000) continue;
    const rechazo = /RECHAZO/i.test(String(meta.counterparty_fullname ?? ""));
    cp.metadata = {
      ...meta,
      counterparty_verification_status: rechazo ? "Rejected" : "Verified",
      counterparty_verification_description: rechazo ? "Beneficiary rejected by compliance" : "",
    };
    await almacen.guardar("contraparte", String(cp.id), cp);
  }

  // Movimientos
  for (const mm of await almacen.listar("movimiento")) {
    const st = mm.status as Obj;
    const edad = ms - Number(mm._ms ?? 0);
    const familia = mm.type === "cross_border" ? "cross_border_money_movements" : "money_movements";
    const cambiar = async (state: string, code = "", description = "") => {
      mm.status = { state, code, description };
      mm.updated_at = iso(ms);
      mm._ms = ms;
      await almacen.guardar("movimiento", String(mm.id), mm);
      await encolar(almacen, `${familia}.status.${state}`, publico(mm), ms);
    };
    const base = { money_movement_id: mm.id, mm_external_id: mm.external_id };

    if (mm.type === "r2p_spei") {
      if (st.state === "initiated" && Date.parse(String((mm.metadata as Obj).valid_until)) <= ms) {
        await cambiar("rejected", "F003", "The Request-to-Pay link expired");
      }
      continue;
    }
    if (mm.type === "global_pay_to_usa") {
      if (st.state !== "initiated" || edad < 2000) continue;
      const g = await almacen.leer("cuenta", String(mm.source_id));
      if (!g || Number(g.obtained_balance ?? 0) < Number(mm.amount)) {
        await cambiar("failed", "F002", "NSF - Not Sufficient Funds in the designated account");
        continue;
      }
      const meta = { ...base, description: (mm.metadata as Obj).description };
      await movimientoSaldo(
        almacen,
        String(mm.source_id),
        -Number(mm.amount),
        "global_pay_to_usa_debit",
        meta,
        ms,
      );
      await movimientoSaldo(
        almacen,
        String(mm.destination_id),
        Number(mm.amount),
        "global_pay_to_usa_credit",
        meta,
        ms,
      );
      await cambiar("completed");
      continue;
    }
    if (mm.type === "cross_border") {
      if (st.state === "initiated" && edad >= 1000) {
        const src = await almacen.leer("cuenta", String(mm.source_id));
        if (!src || Number(src.obtained_balance ?? 0) < Number(mm.amount)) {
          await cambiar("failed", "F002", "NSF - Not Sufficient Funds in the designated account");
          continue;
        }
        await cambiar("processing");
      } else if (st.state === "processing" && edad >= 3000) {
        const meta = { ...base, description: "Cross Border" };
        await movimientoSaldo(
          almacen,
          String(mm.source_id),
          -Number(mm.amount),
          "cbmm_debit",
          meta,
          ms,
        );
        await movimientoSaldo(
          almacen,
          String(mm.destination_id),
          Number(mm._destino ?? 0),
          "cbmm_credit",
          meta,
          ms,
        );
        await cambiar("completed");
      }
      continue;
    }

    // Envíos: spei, spei_return, fedwire, swift
    const debito =
      mm.type === "fedwire" ? "fedwire_debit" : mm.type === "swift" ? "swift_debit" : "spei_debit";
    if (st.state === "initiated" && edad >= 1000) {
      const cuenta = await almacen.leer("cuenta", String(mm.source_id));
      if (!cuenta || Number(cuenta.obtained_balance ?? 0) < Number(mm.amount)) {
        await cambiar("failed", "F002", "NSF - Not Sufficient Funds in the designated account");
        continue;
      }
      const rastreo =
        mm.type === "spei" || mm.type === "spei_return" ? `SIM${String(ms).slice(-10)}` : "";
      if (rastreo) mm.metadata = { ...(mm.metadata as Obj), tracking_key: rastreo };
      await movimientoSaldo(
        almacen,
        String(mm.source_id),
        -Number(mm.amount),
        debito,
        { ...base, ...(rastreo ? { tracking_key: rastreo } : {}) },
        ms,
      );
      await cambiar("processing");
    } else if (st.state === "processing" && edad >= 4000) {
      const cp = await almacen.leer("contraparte", String(mm.destination_id));
      const titular = String(((cp?.metadata ?? {}) as Obj).counterparty_fullname ?? "");
      if (mm.type === "swift" && /FALLA/i.test(titular)) {
        await movimientoSaldo(
          almacen,
          String(mm.source_id),
          Number(mm.amount),
          "swift_refund",
          base,
          ms,
        );
        await cambiar("failed", "R001", "The beneficiary bank rejected the payment");
      } else if (mm.type === "spei" && /RECHAZO/i.test(titular)) {
        await movimientoSaldo(
          almacen,
          String(mm.source_id),
          Number(mm.amount),
          "spei_rejected",
          { ...base, tracking_key: (mm.metadata as Obj).tracking_key },
          ms,
        );
        await cambiar("rejected", "R005", "Account does not exist");
      } else {
        if (mm.type === "spei") {
          mm.metadata = {
            ...(mm.metadata as Obj),
            cep_url: `https://www.banxico.org.mx/cep/simulado/${mm.id}`,
          };
          if (/REBOTE/i.test(titular)) mm._rebote = ms + 3000;
        }
        if (mm.type === "swift")
          mm.metadata = { ...(mm.metadata as Obj), swift_uetr: crypto.randomUUID() };
        await cambiar("completed");
      }
    } else if (st.state === "completed" && typeof mm._rebote === "number" && ms >= mm._rebote) {
      delete mm._rebote;
      await almacen.guardar("movimiento", String(mm.id), mm);
      await movimientoSaldo(
        almacen,
        String(mm.source_id),
        Number(mm.amount),
        "spei_rejected",
        { ...base, tracking_key: (mm.metadata as Obj).tracking_key },
        ms,
      );
    }
  }

  // Verificaciones de CLABE
  for (const av of await almacen.listar("verificacion")) {
    const st = (av.status ?? {}) as Obj;
    if (st.state !== "processing" || ms - Number(av._ms ?? 0) < 5000) continue;
    const n = String(((av.verification_request ?? {}) as Obj).account_number ?? "");
    av.status = { state: "completed", code: "", description: "" };
    av.verification_response = {
      verification_result: /0000\d$/.test(n)
        ? "unmatched"
        : /1111\d$/.test(n)
          ? "unresolved"
          : "matched",
    };
    av.updated_at = iso(ms);
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

/** Simula un depósito SPEI a una CLABE (la de un Balance o una virtual). */
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

/** Simula que el pagador deposita en la CLABE dinámica de un R2P (monto exacto). */
export async function pagarR2pSimulado(
  almacen: AlmacenSim,
  clabe: string,
  ms = Date.now(),
): Promise<Obj> {
  const mm = (await almacen.listar("movimiento")).find(
    (m) => m.type === "r2p_spei" && (m.metadata as Obj).virtual_account === clabe,
  );
  if (!mm) throw new Error("No hay un cobro R2P con esa CLABE");
  if ((mm.status as Obj).state !== "initiated")
    throw new Error(`El cobro está ${(mm.status as Obj).state}`);
  if (Date.parse(String((mm.metadata as Obj).valid_until)) <= ms)
    throw new Error("La CLABE ya venció");
  const cp = await almacen.leer("contraparte", String(mm.source_id));
  const meta = (cp?.metadata ?? {}) as Obj;
  const rastreo = `SIMR2P${String(ms).slice(-10)}`;
  mm.metadata = { ...(mm.metadata as Obj), tracking_key: rastreo };
  mm.status = { state: "completed", code: "", description: "" };
  mm.updated_at = iso(ms);
  mm._ms = ms;
  await almacen.guardar("movimiento", String(mm.id), mm);
  await encolar(almacen, "money_movements.status.completed", publico(mm), ms);
  const trx = await movimientoSaldo(
    almacen,
    String(mm.destination_id),
    Number(mm.amount),
    "r2p_spei_credit",
    {
      intended_beneficiary_id: "N/A",
      reference: "1234567",
      sender_account_number: clabeAleatoria("012"),
      description: (mm.metadata as Obj).description_to_payee ?? "",
      sender_name: meta.counterparty_fullname ?? "PAGADOR SIMULADO",
      tracking_key: rastreo,
      sender_id: meta.counterparty_id_number ?? "XAXX010101000",
      account_reference: clabe,
      mm_external_id: mm.external_id,
      money_movement_id: mm.id,
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
