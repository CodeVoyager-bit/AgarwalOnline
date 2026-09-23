export const transitions = {
  order: {
    placed: ["confirmed", "cancelled"],
    confirmed: ["completed"],
    cancelled: [],
    completed: [],
  },
  fulfilment: {
    unassigned: ["picking"],
    picking: ["packed"],
    packed: ["ready"],
    ready: [],
  },
  delivery: {
    unassigned: ["assigned"],
    assigned: ["out-for-delivery"],
    "out-for-delivery": ["delivered", "attempted"],
    attempted: ["out-for-delivery", "failed"],
    delivered: [],
    failed: ["returned"],
    returned: [],
  },
} as const;
export type Dimension = keyof typeof transitions;
export function assertTransition(
  dimension: Dimension,
  previous: string,
  next: string,
) {
  const map = transitions[dimension] as Record<string, readonly string[]>;
  if (!map[previous]?.includes(next))
    throw Error("This status change is not allowed.");
}
