/** True for MySQL/MariaDB unique-key violations (Drizzle may wrap the driver error in `cause`). */
export function isDuplicateKey(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === "ER_DUP_ENTRY" || err?.cause?.code === "ER_DUP_ENTRY";
}
