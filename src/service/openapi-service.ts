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
    "ebay_get_oauth_url",
    "Generate an eBay OAuth authorization URL for seller user-token consent.",
    {
      scopes: z.array(z.string()).optional().describe("Optional OAuth scopes. Defaults to seller listing scopes."),
    },
    async (input) => {
      try {
        const url = authService.getOAuthAuthorizationUrl(input.scopes && input.scopes.length > 0 ? input.scopes : DEFAULT_USER_SCOPES);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ authorizationUrl: url, environment: USER_ENVIRONMENT }, null, 2) },
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
    "Exchange an eBay OAuth authorization code for seller access and refresh tokens.",
    {
      code: z.string().describe("The authorization code returned by eBay."),
    },
    async (input) => {
      try {
        const tokenData = await authService.exchangeAuthorizationCode(input.code);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
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
    {},
    async () => {
      try {
        const accessToken = await authService.refreshUserAccessToken();
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ success: true, accessToken }, null, 2) },
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
    {},
    async () => ({
      content: [
        { type: "text" as const, text: JSON.stringify(authService.getTokenStatus(), null, 2) },
      ],
    }),
  );
}
