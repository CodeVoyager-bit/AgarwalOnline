import { describe, expect, it } from "vitest";
import { basketAfter } from "../src/components/basket";

const line = (quantity: number, at: number) => ({ variantId: "pen", quantity, pricePaise: 1000, at });

describe("Basket counts on the page", () => {
  it("keeps taps saved after the page's basket was read, whichever arrives first", () => {
    // the first tap's cookie refresh read the basket at 100 with 1 in it; taps 2 and 3 were saved at 150 and 180
    const stale = { pen: { quantity: 1, pricePaise: 1000 } };
    expect(basketAfter(stale, 100, { pen: line(3, 180) })).toEqual({ pen: { quantity: 3, pricePaise: 1000 } });
  });

  it("lets a newer read of the basket win, removals included", () => {
    const fresh = { pen: { quantity: 5, pricePaise: 1000 } };
    expect(basketAfter(fresh, 200, { pen: line(3, 180) })).toEqual(fresh);
    expect(basketAfter({}, 200, { pen: line(3, 180) })).toEqual({});
    // and a later save of 0 takes the line out
    expect(basketAfter(fresh, 200, { pen: line(0, 250) })).toEqual({});
  });
});
