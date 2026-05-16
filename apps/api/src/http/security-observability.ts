export type SecurityEventType =
  | "invalid_id"
  | "invalid_body"
  | "invalid_content_type"
  | "rate_limited"
  | "payload_too_large";

const counters = new Map<SecurityEventType, number>();

for (const event of [
  "invalid_id",
  "invalid_body",
  "invalid_content_type",
  "rate_limited",
  "payload_too_large"
] as const) {
  counters.set(event, 0);
}

export const recordSecurityEvent = (event: SecurityEventType): void => {
  const current = counters.get(event) ?? 0;
  counters.set(event, current + 1);
};

export const getSecurityMetricsSnapshot = (): Readonly<Record<SecurityEventType, number>> => ({
  invalid_id: counters.get("invalid_id") ?? 0,
  invalid_body: counters.get("invalid_body") ?? 0,
  invalid_content_type: counters.get("invalid_content_type") ?? 0,
  rate_limited: counters.get("rate_limited") ?? 0,
  payload_too_large: counters.get("payload_too_large") ?? 0
});
