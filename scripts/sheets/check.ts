// Diagnostic: can the service account reach a sheet, and what tabs does it have?
// Usage: npx tsx scripts/sheets-check.ts <key.json> <spreadsheetId> [more ids...]
import { readFileSync } from "node:fs";
import { parseServiceAccount, signServiceAccountJwt } from "@/server/sheets/jwt";

const creds = parseServiceAccount(Buffer.from(readFileSync(process.argv[2], "utf8")).toString("base64"))!;
const assertion = signServiceAccountJwt({ ...creds, scope: "https://www.googleapis.com/auth/spreadsheets" });
const tok = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
});
if (!tok.ok) { console.log("token failed", tok.status, await tok.text()); process.exit(1); }
const { access_token } = (await tok.json()) as { access_token: string };
console.log("service account:", creds.clientEmail);
for (const id of process.argv.slice(3)) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties(title,sheetId,gridProperties)`, {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!res.ok) { console.log(`\n${id}: NO ACCESS (${res.status}) ${(await res.text()).slice(0, 200)}`); continue; }
  const j = (await res.json()) as { properties: { title: string }; sheets: { properties: { title: string; sheetId: number; gridProperties: { rowCount: number } } }[] };
  console.log(`\n${id} — "${j.properties.title}"`);
  for (const s of j.sheets) console.log(`   ${s.properties.title}  (id ${s.properties.sheetId}, ${s.properties.gridProperties.rowCount} rows)`);
}
