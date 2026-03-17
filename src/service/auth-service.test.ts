import { beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadAuthModule() {
  return import("./auth-service.js");
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
  });
});
