import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Save a rendered PDF to ./tmp/pdfs/ on local dev for quick inspection.
 * Skipped in production. Failures are logged but never bubble up — this is a
 * convenience, not a source-of-truth artifact.
 *
 * Returns the absolute path written, or null if skipped/failed.
 */
export async function saveLocalDevPdf(
  invoiceNumber: string,
  pdf: Buffer,
): Promise<string | null> {
  if (process.env.NODE_ENV === "production") return null;
  const dir = join(process.cwd(), "tmp", "pdfs");
  try {
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${invoiceNumber}.pdf`);
    await writeFile(filePath, pdf);
    return filePath;
  } catch (e) {
    console.warn("[local-dev pdf save] failed", e);
    return null;
  }
}
