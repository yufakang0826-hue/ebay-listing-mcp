import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };
const TEMP_DIR = path.join(os.tmpdir(), "ebay-listing-mcp-tests");

async function loadAuthModule() {
  return import("./auth-service.js");
}

function createTempStorePath(testName: string): string {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  return path.join(TEMP_DIR, `${testName}.json`);
}

describe("authService", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.EBAY_CLIENT_TOKEN;
    delete process.env.EBAY_APP_ACCESS_TOKEN;
    delete process.env.EBAY_USER_ACCESS_TOKEN;
    delete process.env.EBAY_USER_REFRESH_TOKEN;
    delete process.env.EBAY_CLIENT_ID;
    delete process.env.EBAY_CLIENT_SECRET;
    delete process.env.EBAY_REDIRECT_URI;
    delete process.env.EBAY_MARKETPLACE_ID;
    delete process.env.EBAY_CONTENT_LANGUAGE;
    delete process.env.EBAY_SELLER_PROFILE_STORE;
  });

  it("reports a startup error when no credentials are configured", async () => {
    const { authService } = await loadAuthModule();

    expect(authService.getStartupErrors()).toEqual([
      "Authentication is not configured. Provide one of: EBAY_CLIENT_TOKEN, EBAY_APP_ACCESS_TOKEN, EBAY_USER_ACCESS_TOKEN, or EBAY_CLIENT_ID/EBAY_CLIENT_SECRET.",
    ]);
  });

  it("accepts client credentials setup without requiring tokens", async () => {
    process.env.EBAY_CLIENT_ID = "client-id";
    process.env.EBAY_CLIENT_SECRET = "client-secret";
    const { authService } = await loadAuthModule();

    expect(authService.getStartupErrors()).toEqual([]);
    expect(authService.getTokenStatus()).toMatchObject({
      authenticated: true,
      currentTokenType: "none",
      marketplaceId: "EBAY_US",
      contentLanguage: "en-US",
    });
  });

  it("builds an OAuth URL with seller scopes and redirect URI", async () => {
    process.env.EBAY_CLIENT_ID = "client-id";
    process.env.EBAY_REDIRECT_URI = "my-ru-name";
    const { authService } = await loadAuthModule();

    const url = new URL(authService.getOAuthAuthorizationUrl());

    expect(url.hostname).toBe("auth.ebay.com");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("my-ru-name");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("https://api.ebay.com/oauth/api_scope/sell.inventory");
    expect(url.searchParams.get("scope")).toContain("https://api.ebay.com/oauth/api_scope/sell.account");
    expect(url.searchParams.get("scope")).toContain("https://api.ebay.com/oauth/api_scope/sell.analytics.readonly");
  });

  it("parses a full callback URL and restores seller profile from state", async () => {
    const { resolveAuthorizationInput } = await loadAuthModule();

    expect(resolveAuthorizationInput("https://lehao-erp.com/api/stores/oauth/callback?code=v%255E1.1%2523abc&state=store-us-main")).toEqual({
      authorizationCode: "v^1.1#abc",
      sellerProfileIdFromState: "store-us-main",
    });
  });

  it("accepts a raw authorization code without callback URL parsing", async () => {
    const { resolveAuthorizationInput } = await loadAuthModule();

    expect(resolveAuthorizationInput("v%5E1.1%23raw-code")).toEqual({
      authorizationCode: "v^1.1#raw-code",
    });
  });

  it("accepts seller profile store setup without legacy env tokens", async () => {
    const storePath = createTempStorePath("auth-service-profile-store");
    process.env.EBAY_SELLER_PROFILE_STORE = storePath;
    fs.writeFileSync(storePath, JSON.stringify({
      activeSellerProfileId: "store-a",
      profiles: {
        "store-a": {
          sellerProfileId: "store-a",
          sellerProfileLabel: "Store A",
          marketplaceId: "EBAY_US",
          contentLanguage: "en-US",
          userAccessToken: "token-a",
          refreshToken: "refresh-a",
          updatedAt: "2026-03-17T00:00:00.000Z",
        },
      },
    }), "utf-8");

    const { authService } = await loadAuthModule();

    expect(authService.getStartupErrors()).toEqual([]);
    expect(authService.getTokenStatus()).toMatchObject({
      authenticated: true,
      currentTokenType: "user",
      usingSellerProfileStore: true,
      sellerProfileId: "store-a",
      sellerProfileLabel: "Store A",
      activeSellerProfileId: "store-a",
    });
    expect(authService.listSellerProfiles()).toHaveLength(1);
  });

  it("can switch the active seller profile", async () => {
    const storePath = createTempStorePath("auth-service-switch-profile");
    process.env.EBAY_SELLER_PROFILE_STORE = storePath;
    fs.writeFileSync(storePath, JSON.stringify({
      activeSellerProfileId: "store-a",
      profiles: {
        "store-a": {
          sellerProfileId: "store-a",
          sellerProfileLabel: "Store A",
          userAccessToken: "token-a",
          refreshToken: "refresh-a",
          updatedAt: "2026-03-17T00:00:00.000Z",
        },
        "store-b": {
          sellerProfileId: "store-b",
          sellerProfileLabel: "Store B",
          userAccessToken: "token-b",
          refreshToken: "refresh-b",
          updatedAt: "2026-03-17T00:00:00.000Z",
        },
      },
    }), "utf-8");

    const { authService } = await loadAuthModule();
    authService.setActiveSellerProfile("store-b");

    expect(authService.getTokenStatus()).toMatchObject({
      sellerProfileId: "store-b",
      sellerProfileLabel: "Store B",
      activeSellerProfileId: "store-b",
      usingSellerProfileStore: true,
    });
    expect(authService.getSellerContext()).toMatchObject({
      sellerProfileId: "store-b",
      sellerProfileLabel: "Store B",
      marketplaceId: "EBAY_US",
      contentLanguage: "en-US",
    });
  });

  it("can create a seller profile before authorization", async () => {
    const storePath = createTempStorePath("auth-service-upsert-profile");
    process.env.EBAY_SELLER_PROFILE_STORE = storePath;
    const { authService } = await loadAuthModule();

    const profile = authService.upsertSellerProfile({
      sellerProfileId: "store-de-main",
      sellerProfileLabel: "德国主店",
      marketplaceId: "EBAY_DE",
      contentLanguage: "de-DE",
      setActive: true,
    });

    expect(profile).toMatchObject({
      sellerProfileId: "store-de-main",
      sellerProfileLabel: "德国主店",
      marketplaceId: "EBAY_DE",
      contentLanguage: "de-DE",
      isActive: true,
      hasUserAccessToken: false,
      hasRefreshToken: false,
    });
    expect(authService.getSellerContext()).toMatchObject({
      sellerProfileId: "store-de-main",
      marketplaceId: "EBAY_DE",
      contentLanguage: "de-DE",
    });
  });
});
