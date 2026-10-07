import { describe, expect, it } from "vitest";

import { queryParamsWithDefaults } from "./queryParams";

describe("queryParamsWithDefaults", () => {
  it("clears optional filters and defaults without dropping another view's state", () => {
    const params = queryParamsWithDefaults(
      { q: "", page: 1, minPizza: 0 },
      { q: "", page: 1, minPizza: undefined, maxPizza: undefined },
      new URLSearchParams("q=old&page=2&maxPizza=5&minPizza=1&view=requests"),
    );
    expect(params.toString()).toBe("view=requests&minPizza=0");
  });
});
