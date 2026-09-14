import { parseServiceAccount, signServiceAccountJwt } from "./jwt";

/** The only way the app touches Google Sheets — swapped for an in-memory fake in tests. */
export interface SheetsGateway {
  readonly spreadsheetUrl: string | null;
  ensureTabs(names: string[]): Promise<void>;
  read(tab: string): Promise<string[][]>;
  /** Replaces the whole tab. */
  write(tab: string, rows: string[][]): Promise<void>;
}

export class MemorySheetsGateway implements SheetsGateway {
  readonly spreadsheetUrl = null;
  tabs = new Map<string, string[][]>();

  async ensureTabs(names: string[]): Promise<void> {
    for (const n of names) if (!this.tabs.has(n)) this.tabs.set(n, []);
  }

  async read(tab: string): Promise<string[][]> {
    return (this.tabs.get(tab) ?? []).map((r) => [...r]);
  }

  async write(tab: string, rows: string[][]): Promise<void> {
    this.tabs.set(
      tab,
      rows.map((r) => [...r]),
    );
  }
}

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export class GoogleSheetsGateway implements SheetsGateway {
  private token: { value: string; exp: number } | null = null;

  constructor(
    private readonly creds: { clientEmail: string; privateKey: string },
    private readonly spreadsheetId: string,
  ) {}

  get spreadsheetUrl(): string {
    return `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit`;
  }

  private async accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.token.exp - 60 > now) return this.token.value;
    const assertion = signServiceAccountJwt({ ...this.creds, scope: SCOPE, now });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!res.ok) throw new Error(`Google sign-in for the sheet failed (${res.status}). Check GOOGLE_SERVICE_ACCOUNT_JSON.`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, exp: now + j.expires_in };
    return j.access_token;
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await this.accessToken()}`, "content-type": "application/json" },
    });
    if (res.status === 403 || res.status === 404) {
      throw new Error(`The app can't open the Google Sheet (${res.status}). Share it with ${this.creds.clientEmail} as Editor and check GOOGLE_SHEET_ID.`);
    }
    if (!res.ok) throw new Error(`Google Sheets error (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  private static range(tab: string, cell = ""): string {
    return encodeURIComponent(`'${tab.replace(/'/g, "''")}'${cell}`);
  }

  async ensureTabs(names: string[]): Promise<void> {
    const meta = await this.api<{ sheets?: { properties: { title: string } }[] }>("?fields=sheets.properties.title");
    const have = new Set((meta.sheets ?? []).map((s) => s.properties.title));
    const missing = names.filter((n) => !have.has(n));
    if (missing.length === 0) return;
    await this.api(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }) });
  }

  async read(tab: string): Promise<string[][]> {
    const j = await this.api<{ values?: unknown[][] }>(`/values/${GoogleSheetsGateway.range(tab)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`);
    return (j.values ?? []).map((r) => r.map((c) => (c == null ? "" : String(c))));
  }

  async write(tab: string, rows: string[][]): Promise<void> {
    await this.api(`/values/${GoogleSheetsGateway.range(tab)}:clear`, { method: "POST", body: "{}" });
    if (rows.length === 0) return;
    // RAW keeps dates, phones and IDs exactly as written (no auto-conversion).
    await this.api(`/values/${GoogleSheetsGateway.range(tab, "!A1")}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: rows }) });
  }
}

export function sheetsConfigInfo(): { configured: boolean; serviceAccountEmail: string | null; spreadsheetId: string | null } {
  const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const id = process.env.GOOGLE_SHEET_ID?.trim() || null;
  return { configured: Boolean(creds && id), serviceAccountEmail: creds?.clientEmail ?? null, spreadsheetId: id };
}

export function sheetsGatewayFromEnv(): SheetsGateway | null {
  const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const id = process.env.GOOGLE_SHEET_ID?.trim();
  return creds && id ? new GoogleSheetsGateway(creds, id) : null;
}
