// One-off (2026-10-13): folds Sharan's answer sheet into the app's sheet and tidies stale tabs.
// Usage: npx tsx scripts/sheets-consolidate.ts <key.json> <appSheetId> <sharanSheetId>
import { readFileSync } from "node:fs";
import { parseServiceAccount, signServiceAccountJwt } from "@/server/sheets/jwt";

const creds = parseServiceAccount(Buffer.from(readFileSync(process.argv[2], "utf8")).toString("base64"))!;
const [, , , APP, SHARAN] = process.argv;
const assertion = signServiceAccountJwt({ ...creds, scope: "https://www.googleapis.com/auth/spreadsheets" });
const tok = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
const { access_token } = (await tok.json()) as { access_token: string };
const H = { authorization: `Bearer ${access_token}`, "content-type": "application/json" };

const api = async (path: string, init?: RequestInit) => {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, { ...init, headers: H });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<any>;
};
const tabs = async (id: string) => {
  const j = await api(`${id}?fields=sheets.properties(title,sheetId)`);
  return new Map<string, number>(j.sheets.map((s: any) => [s.properties.title, s.properties.sheetId]));
};
const read = async (id: string, range: string) => ((await api(`${id}/values/${encodeURIComponent(range)}`)).values ?? []) as string[][];

const appTabs = await tabs(APP);
const copies: [string, string][] = [["Questions", "Reference – Sharan's answers"], ["Coaches (Sharan's answers)", "Reference – Coaches list"]];

for (const [from, to] of copies) {
  const rows = await read(SHARAN, `${from}!A1:J60`);
  if (!rows.length) { console.log(`skip ${from}: empty`); continue; }
  if (!appTabs.has(to)) {
    await api(`${APP}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: to } } }] }) });
    console.log(`created tab "${to}"`);
  }
  await api(`${APP}/values/${encodeURIComponent(`${to}!A1`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: rows }) });
  console.log(`copied ${rows.length} rows: "${from}" → "${to}"`);
}

// The rows pasted into the wrong columns in September are replaced on the next sync; clear them now so nothing is misread.
const junk = "Students – Bal Bharati Public School";
if (appTabs.has(junk)) {
  await api(`${APP}/values/${encodeURIComponent(`${junk}!A2:Z500`)}:clear`, { method: "POST", body: "{}" });
  console.log(`cleared the pasted rows from "${junk}"`);
}

// NK Bagrodia and R.D. Rajpal stay on paper, so their (empty) tabs go.
const stale = ["Students – NK Bagrodia Public School", "Students – R.D. Rajpal School"];
const requests = stale.filter((t) => appTabs.has(t)).map((t) => ({ deleteSheet: { sheetId: appTabs.get(t) } }));
if (requests.length) {
  await api(`${APP}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
  console.log(`deleted stale tabs: ${stale.filter((t) => appTabs.has(t)).join(", ")}`);
}
