import "dotenv/config";
import { Connection, Client } from "@temporalio/client";
import {
  getTemporalConnectOptions,
  getTemporalNamespace,
  getTemporalAddress,
} from "../src/temporal/connect.js";

console.log(`Address:   ${getTemporalAddress()}`);
console.log(`Namespace: ${getTemporalNamespace()}`);

const opts = getTemporalConnectOptions();
console.log(`TLS:       ${opts.tls === true}`);
console.log(`API key:   ${opts.apiKey ? "set" : "not set"}`);

const conn = await Connection.connect(opts);
const client = new Client({ connection: conn, namespace: getTemporalNamespace() });
let count = 0;
for await (const _wf of client.workflow.list()) {
  count++;
  if (count >= 5) break;
}
console.log(`Workflows visible (capped at 5): ${count}`);
await conn.close();
console.log("OK");
