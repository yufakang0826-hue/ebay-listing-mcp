import { beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadConstantsModule() {
  return import("./constants.js");
}

describe("constants", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.EBAY_API_ENV;
    delete process.env.EBAY_ALLOW_PRODUCTION_WRITES;
  });

  it("keeps production read-only writes disabled by default", async () => {
    const constants = await loadConstantsModule();

    expect(constants.isMethodAllowed("GET", "/sell/inventory/v1/offer")).toBe(true);
    expect(constants.isMethodAllowed("POST", "/sell/inventory/v1/offer")).toBe(false);
    expect(constants.getSupportedCallingMethods("/sell/inventory/v1/offer")).toEqual(["get", "options", "head"]);
  });

  it("allows only allowlisted production writes when enabled", async () => {
    process.env.EBAY_ALLOW_PRODUCTION_WRITES = "true";
    const constants = await loadConstantsModule();

    expect(constants.isMethodAllowed("POST", "/sell/inventory/v1/location/main-warehouse")).toBe(true);
    expect(constants.isMethodAllowed("PUT", "/sell/inventory/v1/inventory_item/test-sku")).toBe(true);
    expect(constants.isMethodAllowed("PUT", "/sell/inventory/v1/inventory_item_group/group-1")).toBe(true);
    expect(constants.isMethodAllowed("POST", "/sell/inventory/v1/offer")).toBe(true);
    expect(constants.isMethodAllowed("POST", "/sell/inventory/v1/offer/123/publish")).toBe(true);
    expect(constants.isMethodAllowed("POST", "/sell/inventory/v1/offer/publish_by_inventory_item_group")).toBe(true);
    expect(constants.isMethodAllowed("POST", "/sell/account/v1/fulfillment_policy")).toBe(true);
    expect(constants.isMethodAllowed("POST", "/sell/account/v1/payment_policy")).toBe(true);
    expect(constants.isMethodAllowed("POST", "/sell/account/v1/return_policy")).toBe(true);
    expect(constants.isMethodAllowed("DELETE", "/sell/inventory/v1/offer/123")).toBe(false);
    expect(constants.isMethodAllowed("POST", "/sell/account/v1/program/get_opted_in_programs")).toBe(false);
  });

  it("allows sandbox write methods without the production flag", async () => {
    process.env.EBAY_API_ENV = "sandbox";
    const constants = await loadConstantsModule();

    expect(constants.isMethodAllowed("POST", "/sell/inventory/v1/offer")).toBe(true);
    expect(constants.isMethodAllowed("PATCH", "/sell/inventory/v1/inventory_item/test-sku")).toBe(true);
  });
});
