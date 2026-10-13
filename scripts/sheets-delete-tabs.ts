// Deletes tabs from a spreadsheet. Usage: npx tsx scripts/sheets-delete-tabs.ts <key.json> <id> "Tab name" ...
import { readFileSync } from "node:fs";
import { parseServiceAccount, signServiceAccountJwt } from "@/server/sheets/jwt";

const creds = parseServiceAccount(Buffer.from(readFileSync(process.argv[2], "utf8")).toString("base64"))!;
const assertion = signServiceAccountJwt({ ...creds, scope: "https://www.googleapis.com/auth/spreadsheets" });
const tok = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
const { access_token } = (await tok.json()) as { access_token: string };
const H = { authorization: `Bearer ${access_token}`, "content-type": "application/json" };
const id = process.argv[3];
const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(title,sheetId)`, { headers: H })).json() as { sheets: { properties: { title: string; sheetId: number } }[] };
const byTitle = new Map(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
const requests = [];
for (const title of process.argv.slice(4)) {
  const sheetId = byTitle.get(title);
  if (sheetId === undefined) { console.log(`skip: no tab "${title}"`); continue; }
  requests.push({ deleteSheet: { sheetId } });
  console.log(`delete "${title}"`);
}
if (requests.length) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { method: "POST", headers: H, body: JSON.stringify({ requests }) });
  console.log(res.ok ? "done" : `failed ${res.status} ${(await res.text()).slice(0, 200)}`);
}
