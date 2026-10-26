import { test } from "node:test";
import assert from "node:assert/strict";
import { searchProducts } from "../server/search.js";
import { catalog } from "../src/catalog.js";
test("vegan protein under $40 is tied to catalog attributes", () => {
  const r = searchProducts(catalog, "vegan protein under $40");
  assert.deepEqual(
    r.map((x) => x.id),
    ["p2"],
  );
  assert(r.every((x) => x.price < 4000 && x.dietary.includes("Vegan")));
});
test("caffeine-free excludes caffeinated pre-workout", () =>
  assert.deepEqual(
    searchProducts(catalog, "caffeine-free pre-workout").map((x) => x.id),
    ["p5"],
  ));
test("synonyms and spelling mistakes", () => {
  assert(
    searchProducts(catalog, "plant-based protien under 40").some(
      (x) => x.id === "p2",
    ),
  );
  assert.deepEqual(
    searchProducts(catalog, "creatin").map((x) => x.id),
    ["p3"],
  );
});
test("filters compose and stock is respected", () => {
  assert.equal(
    searchProducts(catalog, "", { flavor: "Peach", inStock: "true" }).length,
    0,
  );
  assert.equal(
    searchProducts(catalog, "", { brand: "APEX", ingredient: "caffeine" })
      .length,
    1,
  );
});
test("unrelated query does not fabricate products", () =>
  assert.equal(searchProducts(catalog, "moon dust").length, 0));
