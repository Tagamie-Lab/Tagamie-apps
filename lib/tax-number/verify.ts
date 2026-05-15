import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const T_NUMBER_RE = /^T\d{13}$/;

export function isWellFormedTaxNumber(s: string): boolean {
  return T_NUMBER_RE.test(s);
}

export type TaxNumberStatus = "active" | "withdrawn" | "unknown";

export interface TaxNumberInfo {
  taxNumber: string;
  name: string | null;
  status: TaxNumberStatus;
  verifiedAt: Date;
  source: "manual" | "api";
}

/**
 * Look up a T-number from the local cache. Returns null if absent.
 * W2 uses manual seeds; W5 will replace this with NTA Web-API auto-sync.
 */
export async function lookupTaxNumber(taxNumber: string): Promise<TaxNumberInfo | null> {
  if (!isWellFormedTaxNumber(taxNumber)) return null;
  const row = await db.query.taxNumberCache.findFirst({
    where: eq(schema.taxNumberCache.taxNumber, taxNumber),
  });
  if (!row) return null;
  return {
    taxNumber: row.taxNumber,
    name: row.name,
    status: row.status,
    verifiedAt: row.verifiedAt,
    source: row.source,
  };
}
