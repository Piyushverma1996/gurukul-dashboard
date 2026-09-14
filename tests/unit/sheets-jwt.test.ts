import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseServiceAccount, signServiceAccountJwt } from "@/server/sheets/jwt";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

describe("service-account JWT", () => {
  it("signs an RS256 assertion Google's token endpoint accepts", () => {
    const jwt = signServiceAccountJwt({ clientEmail: "sync@gurukul.iam.gserviceaccount.com", privateKey, scope: "https://www.googleapis.com/auth/spreadsheets", now: 1_800_000_000 });
    const [h, c, s] = jwt.split(".");
    expect(decode(h)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(c)).toEqual({
      iss: "sync@gurukul.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    const ok = createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });

  it("reads the service-account key from raw JSON or base64", () => {
    const json = JSON.stringify({ client_email: "a@b.iam.gserviceaccount.com", private_key: privateKey });
    expect(parseServiceAccount(json)).toEqual({ clientEmail: "a@b.iam.gserviceaccount.com", privateKey });
    expect(parseServiceAccount(Buffer.from(json).toString("base64"))).toEqual({ clientEmail: "a@b.iam.gserviceaccount.com", privateKey });
    expect(parseServiceAccount("not json")).toBeNull();
  });
});
