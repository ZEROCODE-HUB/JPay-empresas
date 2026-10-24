/**
 * BDC Conecta integration (Banco de Comercio).
 *
 *   import { createBdcClient } from "@/lib/bdc";
 *
 *   const bdc = createBdcClient();
 *   await bdc.getAccountInfo(cbu);
 *   await bdc.transfer({ originId, from, to, amount });
 *
 * The frontend always talks to the platform backend. The environment
 * (sandbox / homologacion / produccion) is defined ONLY in the backend `.env`
 * (`BDC_MODE`); the browser never sees it nor can change it.
 */
export {
  createBdcClient,
  type BdcAccountInfoData,
} from "./client.ts";

export {
  canQueryBdc,
  canTransferBdc,
  type BdcAccount,
} from "./config.ts";