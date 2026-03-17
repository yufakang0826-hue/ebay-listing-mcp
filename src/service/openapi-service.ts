import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_USER_SCOPES, USER_ENVIRONMENT } from "../constant/constants.js";
import { formatAxiosError } from "../helper/http-helper.js";
import { registerAnalyticsTools } from "./analytics-service.js";
import { authService } from "./auth-service.js";
import { registerListingTools } from "./listing-service.js";

/**
 * Register the minimal seller-listing toolset with MCP.
 * This fork intentionally exposes only auth + listing tools for now.
 */
export async function registerOpenApiTools(server: McpServer): Promise<void> {
  registerAuthTools(server);
  registerAnalyticsTools(server);
  registerListingTools(server);
}

function registerAuthTools(server: McpServer): void {
  server.tool(
    "ebay_upsert_seller_profile",
    "Create or update a local seller profile before authorization, so each store can keep its own marketplace and language defaults.",
    {
      sellerProfileId: z.string().describe("Seller profile ID, for example store-us-main."),
      sellerProfileLabel: z.string().optional().describe("Optional seller profile label, for example 美国主店."),
      marketplaceId: z.string().optional().describe("Optional marketplace ID. Defaults to the existing profile or EBAY_MARKETPLACE_ID."),
      contentLanguage: z.string().optional().describe("Optional content language. Defaults to the existing profile or EBAY_CONTENT_LANGUAGE."),
      setActive: z.boolean().default(true).describe("Whether to make this seller profile active immediately."),
    },
    async (input) => {
      try {
        const profile = authService.upsertSellerProfile(input);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ success: true, sellerProfile: profile }, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatAxiosError(error) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "ebay_import_env_tokens_to_seller_profile",
    "One-time migration helper. Import the current .env user tokens into a seller profile so an already authorized machine can start using seller-profile mode immediately.",
    {
      sellerProfileId: z.string().describe("Seller profile ID, for example store-us-main."),
      sellerProfileLabel: z.string().optional().describe("Optional seller profile label, for example 美国主店."),
      marketplaceId: z.string().optional().describe("Optional marketplace ID. Defaults to the existing profile or EBAY_MARKETPLACE_ID."),
      contentLanguage: z.string().optional().describe("Optional content language. Defaults to the existing profile or EBAY_CONTENT_LANGUAGE."),
      setActive: z.boolean().default(true).describe("Whether to make this seller profile active immediately."),
      overwriteExistingTokens: z.boolean().default(true).describe("Whether the profile should be updated with the current .env tokens."),
    },
    async (input) => {
      try {
        const profile = authService.importEnvTokensToSellerProfile(input);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ success: true, sellerProfile: profile }, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatAxiosError(error) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "ebay_get_oauth_url",
    "Generate an eBay OAuth authorization URL for seller user-token consent.",
    {
      scopes: z.array(z.string()).optional().describe("Optional OAuth scopes. Defaults to seller listing scopes."),
      sellerProfileId: z.string().optional().describe("Optional seller profile ID. If provided, it is also used as the default state value."),
      state: z.string().optional().describe("Optional OAuth state value. Defaults to sellerProfileId when provided."),
    },
    async (input) => {
      try {
        const url = authService.getOAuthAuthorizationUrl(
          input.scopes && input.scopes.length > 0 ? input.scopes : DEFAULT_USER_SCOPES,
          input.state || input.sellerProfileId,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                authorizationUrl: url,
                environment: USER_ENVIRONMENT,
                sellerProfileId: input.sellerProfileId || null,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatAxiosError(error) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "ebay_exchange_authorization_code",
    "Exchange an eBay OAuth authorization code or full callback URL for seller access and refresh tokens.",
    {
      code: z.string().describe("The authorization code returned by eBay, or the full callback URL copied from the browser address bar."),
      sellerProfileId: z.string().optional().describe("Optional seller profile ID used to persist the user token for a specific store or seller."),
      sellerProfileLabel: z.string().optional().describe("Optional seller profile label, for example a store name."),
      marketplaceId: z.string().optional().describe("Optional marketplace ID to persist with this seller profile."),
      contentLanguage: z.string().optional().describe("Optional content language to persist with this seller profile."),
    },
    async (input) => {
      try {
        const tokenData = await authService.exchangeAuthorizationCode(input.code, {
          sellerProfileId: input.sellerProfileId,
          sellerProfileLabel: input.sellerProfileLabel,
          marketplaceId: input.marketplaceId,
          contentLanguage: input.contentLanguage,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                sellerProfileId: authService.getTokenStatus(input.sellerProfileId).sellerProfileId,
                tokenType: tokenData.token_type || "Bearer",
                expiresIn: tokenData.expires_in,
                refreshTokenExpiresIn: tokenData.refresh_token_expires_in || null,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatAxiosError(error) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "ebay_refresh_access_token",
    "Refresh the stored seller access token using the refresh token.",
    {
      sellerProfileId: z.string().optional().describe("Optional seller profile ID. If omitted, the active seller profile is used first."),
    },
    async (input) => {
      try {
        const accessToken = await authService.refreshUserAccessToken(input.sellerProfileId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, sellerProfileId: input.sellerProfileId || null, accessToken }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatAxiosError(error) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "ebay_get_token_status",
    "Show the current eBay authentication status used by this MCP server.",
    {
      sellerProfileId: z.string().optional().describe("Optional seller profile ID. If omitted, the active seller profile is used first."),
    },
    async (input) => ({
      content: [
        { type: "text" as const, text: JSON.stringify(authService.getTokenStatus(input.sellerProfileId), null, 2) },
      ],
    }),
  );

  server.tool(
    "ebay_list_seller_profiles",
    "List stored seller profiles and show which one is currently active.",
    {},
    async () => ({
      content: [
        { type: "text" as const, text: JSON.stringify({ sellerProfiles: authService.listSellerProfiles() }, null, 2) },
      ],
    }),
  );

  server.tool(
    "ebay_set_active_seller_profile",
    "Set the active seller profile used by listing and analytics tools when sellerProfileId is omitted.",
    {
      sellerProfileId: z.string().describe("Seller profile ID to activate."),
    },
    async (input) => {
      try {
        const profile = authService.setActiveSellerProfile(input.sellerProfileId);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ success: true, activeSellerProfile: profile }, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatAxiosError(error) }],
          isError: true,
        };
      }
    },
  );
}
