import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProject, validateTerm, validateDescription } from "../src/validation.js";

test("validateProject trims the value", () => {
  assert.equal(validateProject("  pipeline  "), "pipeline");
});

test("validateProject rejects an empty value", () => {
  assert.throws(() => validateProject(""), /project.*empty/i);
});

test("validateProject rejects a whitespace-only value", () => {
  assert.throws(() => validateProject("   \t "), /project.*empty/i);
});

test("validateTerm trims the value and keeps the original spelling", () => {
  assert.equal(validateTerm("  Order "), "Order");
  assert.equal(validateTerm("order"), "order");
});

test("validateTerm rejects an empty value", () => {
  assert.throws(() => validateTerm("  "), /term.*empty/i);
});

for (const suffix of ["DTO", "Request", "Response", "Mapper", "Config"]) {
  test(`validateTerm rejects the suffix ${suffix}`, () => {
    assert.throws(() => validateTerm(`Order${suffix}`), /domain term/i);
  });

  test(`validateTerm rejects the suffix ${suffix} in any letter case`, () => {
    assert.throws(
      () => validateTerm(`Order${suffix.toLowerCase()}`),
      /domain term/i,
    );
  });
}

test("validateTerm accepts a term that only contains a suffix word inside it", () => {
  assert.equal(validateTerm("RequestedShipment"), "RequestedShipment");
  assert.equal(validateTerm("ConfigurationProfile"), "ConfigurationProfile");
});

test("validateTerm accepts a plain aggregate root name", () => {
  assert.equal(validateTerm("Shipment"), "Shipment");
});

test("validateDescription trims the value", () => {
  assert.equal(validateDescription("  A purchase request.  "), "A purchase request.");
});

test("validateDescription rejects an empty value", () => {
  assert.throws(() => validateDescription("   "), /description.*empty/i);
});
