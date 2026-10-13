// One-off: renames tabs in a spreadsheet. Usage: npx tsx scripts/sheets-rename-tabs.ts <key.json> <id> "old=new" ...
import { readFileSync } from "node:fs";
import { parseServiceAccount, signServiceAccountJwt } from "@/server/sheets/jwt";

const creds = parseServiceAccount(Buffer.from(readFileSync(process.argv[2], "utf8")).toString("base64"))!;
const assertion = signServiceAccountJwt({ ...creds, scope: "https://www.googleapis.com/auth/spreadsheets" });
const tok = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
const { access_token } = (await tok.json()) as { access_token: string };
const id = process.argv[3];
const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(title,sheetId)`, { headers: { authorization: `Bearer ${access_token}` } })).json() as { sheets: { properties: { title: string; sheetId: number } }[] };
const byTitle = new Map(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
const requests = [];
for (const pair of process.argv.slice(4)) {
  const [from, to] = pair.split("=");
  const sheetId = byTitle.get(from);
  if (sheetId === undefined) { console.log(`skip: no tab called "${from}"`); continue; }
  requests.push({ updateSheetProperties: { properties: { sheetId, title: to }, fields: "title" } });
  console.log(`rename "${from}" → "${to}"`);
}
if (requests.length) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: "POST", headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" }, body: JSON.stringify({ requests }),
  });
  console.log(res.ok ? "done" : `failed ${res.status} ${(await res.text()).slice(0, 200)}`);
}
