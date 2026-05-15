import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import {
  monthlyAggregation,
  manualAggregation,
} from "@/lib/inngest/functions/monthly-aggregation";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [monthlyAggregation, manualAggregation],
});
