import { parsePhoneNumberFromString } from "libphonenumber-js";

const SYNTHETIC_DOMAIN = "users.gurukulfc.invalid";

/** Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX). Returns null when invalid. */
export function toE164India(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  const candidate = !trimmed.startsWith("+") && digits.length === 12 && digits.startsWith("91") ? `+${digits}` : trimmed;
  const parsed = parsePhoneNumberFromString(candidate, "IN");
  if (!parsed || !parsed.isValid() || parsed.country !== "IN") return null;
  return parsed.number;
}

/** "+919876543210" -> "98765 43210" */
export function formatIndianPhone(e164: string): string {
  const local = e164.replace(/^\+91/, "");
  return local.length === 10 ? `${local.slice(0, 5)} ${local.slice(5)}` : e164;
}

/** Number format expected by https://wa.me/<number> */
export function waNumber(e164: string): string {
  return e164.replace(/^\+/, "");
}

/** Better Auth requires an email; staff without a Gmail get this non-routable placeholder. */
export function syntheticEmailForPhone(e164: string): string {
  return `p${e164.replace(/^\+91/, "")}@${SYNTHETIC_DOMAIN}`;
}

export function isSyntheticEmail(email: string): boolean {
  return email.endsWith(`@${SYNTHETIC_DOMAIN}`);
}
