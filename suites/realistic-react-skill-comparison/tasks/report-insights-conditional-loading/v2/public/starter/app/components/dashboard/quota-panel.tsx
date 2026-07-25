import type { Quota } from "@/lib/types";

export function QuotaPanel({ quota }: { quota: Quota }) {
  return <section aria-label="Quota"><p>{quota.used} of {quota.limit} seats used</p></section>;
}
