import { inngest } from "@/lib/inngest/client";
import { aggregatePeriod, previousJstMonth } from "@/lib/aggregation/aggregate";

/**
 * Scheduled monthly aggregation: every month on the 1st at 01:00 JST,
 * aggregate the previous JST month's settle_events into draft invoices.
 */
export const monthlyAggregation = inngest.createFunction(
  {
    id: "monthly-aggregation",
    triggers: [{ cron: "TZ=Asia/Tokyo 0 1 1 * *" }],
  },
  async ({ step }) => {
    const { year, month1based } = previousJstMonth();
    const result = await step.run("aggregate-previous-month", () =>
      aggregatePeriod(year, month1based),
    );
    return result;
  },
);

/**
 * Manual aggregation trigger: emits a one-off event so an arbitrary period
 * can be aggregated from the admin UI without waiting for the cron.
 */
export const manualAggregation = inngest.createFunction(
  {
    id: "manual-aggregation",
    triggers: [{ event: "tagamie/aggregation.requested" }],
  },
  async ({ event, step }) => {
    const { year, month1based } = event.data as {
      year: number;
      month1based: number;
    };
    const result = await step.run("aggregate", () =>
      aggregatePeriod(year, month1based),
    );
    return result;
  },
);
