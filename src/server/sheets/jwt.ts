import { createSign } from "node:crypto";

const b64url = (s: string) => Buffer.from(s).toString("base64url");

/** RS256 assertion for Google's OAuth token endpoint (service-account flow). No googleapis dependency. */
export function signServiceAccountJwt(i: { clientEmail: string; privateKey: string; scope: string; now?: number }): string {
  const iat = i.now ?? Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: i.clientEmail, scope: i.scope, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${header}.${claim}`).sign(i.privateKey).toString("base64url");
  return `${header}.${claim}.${signature}`;
}

/** Accepts the downloaded key file as raw JSON or base64 (easier to paste into hPanel). */
export function parseServiceAccount(raw: string | undefined): { clientEmail: string; privateKey: string } | null {
  if (!raw?.trim()) return null;
  const attempt = (text: string) => {
    try {
      const j = JSON.parse(text) as { client_email?: string; private_key?: string };
      if (j.client_email && j.private_key) return { clientEmail: j.client_email, privateKey: j.private_key.replace(/\\n/g, "\n") };
    } catch {
      /* not this format */
    }
    return null;
  };
  return attempt(raw.trim()) ?? attempt(Buffer.from(raw.trim(), "base64").toString("utf8"));
}
