import { randomInt } from "node:crypto";

// No i, l, o to avoid confusion when read aloud or copied from a phone screen.
const LETTERS = "abcdefghjkmnpqrstuvwxyz";

/** Readable temporary password, e.g. "GFC-4827kqz". The user must change it at first login. */
export function generateTempPassword(): string {
  const digits = String(randomInt(0, 10_000)).padStart(4, "0");
  let letters = "";
  for (let i = 0; i < 3; i++) letters += LETTERS[randomInt(0, LETTERS.length)];
  return `GFC-${digits}${letters}`;
}
