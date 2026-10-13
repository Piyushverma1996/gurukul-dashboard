// Diagnostic: print the first rows of given tabs. Usage: npx tsx scripts/sheets-peek.ts <key.json> <id> "Tab!A1:J6" ...
import { readFileSync } from "node:fs";
import { parseServiceAccount, signServiceAccountJwt } from "@/server/sheets/jwt";

const creds = parseServiceAccount(Buffer.from(readFileSync(process.argv[2], "utf8")).toString("base64"))!;
const assertion = signServiceAccountJwt({ ...creds, scope: "https://www.googleapis.com/auth/spreadsheets" });
const tok = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
const { access_token } = (await tok.json()) as { access_token: string };
const id = process.argv[3];
const ranges = process.argv.slice(4).map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${ranges}`, { headers: { authorization: `Bearer ${access_token}` } });
const j = (await res.json()) as { valueRanges: { range: string; values?: string[][] }[] };
for (const vr of j.valueRanges ?? []) {
  console.log(`\n--- ${vr.range}`);
  for (const row of vr.values ?? []) console.log("   ", row.map((c) => String(c).slice(0, 26)).join(" | "));
}
