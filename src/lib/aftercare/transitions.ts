export const returnTransitions: Record<string, readonly string[]> = {
  requested: ["approved", "rejected"],
  approved: ["pickup-scheduled"],
  "pickup-scheduled": ["picked-up"],
  "picked-up": ["received"],
  received: ["closed"],
  rejected: [],
  closed: [],
};
export const aftercareLabels: Record<string, string> = {
  "missing-item": "Missing item",
  "damaged-item": "Damaged item",
  "wrong-item": "Wrong item",
  other: "Order question",
  requested: "Awaiting review",
  approved: "Approved",
  rejected: "Not approved",
  "pickup-scheduled": "Pickup scheduled",
  "picked-up": "Picked up",
  received: "Received by store",
  closed: "Closed",
  open: "Sent to store",
  reviewing: "Under review",
  resolved: "Resolved",
};
export function aftercareLabel(value: string) {
  return aftercareLabels[value] ?? value;
}
