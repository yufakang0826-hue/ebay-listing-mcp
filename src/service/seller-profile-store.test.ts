import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };
const TEMP_DIR = path.join(os.tmpdir(), "ebay-listing-mcp-tests");

async function loadStoreModule() {
  return import("./seller-profile-store.js");
}

function createTempStorePath(testName: string): string {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  return path.join(TEMP_DIR, `${testName}.json`);
}

describe("sellerProfileStore", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.EBAY_SELLER_PROFILE_STORE;
  });

  it("creates and activates the first seller profile automatically", async () => {
    process.env.EBAY_SELLER_PROFILE_STORE = createTempStorePath("seller-profile-store-create");
    const { sellerProfileStore } = await loadStoreModule();

    const profile = sellerProfileStore.upsertProfile("store-a", {
      sellerProfileLabel: "Store A",
      marketplaceId: "EBAY_US",
      contentLanguage: "en-US",
      userAccessToken: "token-a",
    });

    expect(profile.sellerProfileId).toBe("store-a");
    expect(sellerProfileStore.getActiveProfileId()).toBe("store-a");
    expect(sellerProfileStore.getProfile("store-a")).toMatchObject({
      sellerProfileLabel: "Store A",
      marketplaceId: "EBAY_US",
      contentLanguage: "en-US",
    });
  });

  it("lists profiles in sellerProfileId order and switches active profile", async () => {
    process.env.EBAY_SELLER_PROFILE_STORE = createTempStorePath("seller-profile-store-order");
    const { sellerProfileStore } = await loadStoreModule();

    sellerProfileStore.upsertProfile("store-b", { userAccessToken: "token-b" });
    sellerProfileStore.upsertProfile("store-a", { userAccessToken: "token-a" });
    sellerProfileStore.setActiveProfile("store-b");

    expect(sellerProfileStore.listProfiles().map((profile) => profile.sellerProfileId)).toEqual(["store-a", "store-b"]);
    expect(sellerProfileStore.getActiveProfileId()).toBe("store-b");
  });
});
