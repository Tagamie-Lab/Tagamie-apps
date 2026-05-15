import type { TaxRateGroup } from "./queries";

/**
 * Small-amount exemption (少額特例): NTA Q&A 問59/66.
 * Eligible when ALL of:
 *   1. Period is on/before 2029-09-30 (transitional measure expiry)
 *   2. Buyer has small_amount_exemption_eligible = true (sales <= ¥1B)
 *   3. Every event in the period is < ¥10,000
 *
 * If applied, the buyer may book without itemized invoice support — but Tagamie
 * still issues the qualified invoice for audit trail; "applied" is recorded as
 * a flag on the invoice.
 */
export function applySmallAmountExemption(args: {
  periodMonth: string; // "YYYY-MM-01"
  buyerEligible: boolean;
  groups: TaxRateGroup[];
}): boolean {
  const expiry = "2029-09-01";
  if (args.periodMonth > expiry) return false;
  if (!args.buyerEligible) return false;
  if (args.groups.length === 0) return false;
  return args.groups.every((g) => g.allBelowSmallAmountThreshold);
}
