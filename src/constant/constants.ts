/**
 * Constants used throughout the application
 */

/**
 * Environment options for the eBay API
 */
export enum ApiEnvironment {
  SANDBOX = "sandbox",
  PRODUCTION = "production"
}
/**
 * Utility to find ApiEnvironment by string value
 * Returns PRODUCTION if no match is found
 */
function findApiEnvironmentByValue(value: string): ApiEnvironment {
  const lowercaseValue = value?.toLowerCase();
  const matchedEnv = Object.entries(ApiEnvironment)
    .find(([_key, val]) => typeof val === "string" && val.toLowerCase() === lowercaseValue);
  return matchedEnv ? matchedEnv[1] as ApiEnvironment : ApiEnvironment.PRODUCTION;
}

export const USER_ENVIRONMENT = findApiEnvironmentByValue(process.env.EBAY_API_ENV || "");


/**
 * Recall apiDoc url by prompt
 */
export const RECALL_SPEC_BY_PROMPT_URL = "https://api.ebay.com/developer/mcp/v1/search?query=%s";
/**
 * url for query apiSpec with fields such as specTitle、operationId
 */
export const RECALL_SPEC_WITH_FIELD_URL = "https://api.ebay.com/developer/mcp/v1/search/%s?operationId=%s";

/**
 * API domain name, differentiated by api environment
 */
export const DOMAIN_NAME = {
  [ApiEnvironment.SANDBOX]: "api.sandbox.ebay.com",
  [ApiEnvironment.PRODUCTION]: "api.ebay.com",
};

/**
 * Authentication and seller defaults
 */
export const DEFAULT_MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID || "EBAY_US";
export const DEFAULT_CONTENT_LANGUAGE = process.env.EBAY_CONTENT_LANGUAGE || "en-US";
export const EBAY_ALLOW_PRODUCTION_WRITES = process.env.EBAY_ALLOW_PRODUCTION_WRITES === "true";

/**
 * OAuth scopes used by seller listing flows
 */
export const CORE_APP_SCOPE = "https://api.ebay.com/oauth/api_scope";
export const DEFAULT_USER_SCOPES = [
  CORE_APP_SCOPE,
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
];

/**
 * URLs for OAuth flows
 */
export const OAUTH_DOMAIN_NAME = {
  [ApiEnvironment.SANDBOX]: "auth.sandbox.ebay.com",
  [ApiEnvironment.PRODUCTION]: "auth.ebay.com",
};

export const TOKEN_ENDPOINT = {
  [ApiEnvironment.SANDBOX]: "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
  [ApiEnvironment.PRODUCTION]: "https://api.ebay.com/identity/v1/oauth2/token",
};

/**
 * Supported HTTP methods for generic invocation.
 */
export const SUPPORTED_CALLING_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
const READ_ONLY_METHODS = new Set(["get", "head", "options"]);

/**
 * Production write allowlist for Phase 1 listing support.
 */
export const PRODUCTION_WRITE_PATH_ALLOWLIST = [
  /^\/sell\/inventory\/v1\/location\/[^/]+$/i,
  /^\/sell\/inventory\/v1\/inventory_item\/[^/]+$/i,
  /^\/sell\/inventory\/v1\/inventory_item_group\/[^/]+$/i,
  /^\/sell\/inventory\/v1\/offer$/i,
  /^\/sell\/inventory\/v1\/offer\/[^/]+\/publish$/i,
  /^\/sell\/inventory\/v1\/offer\/publish_by_inventory_item_group$/i,
  /^\/sell\/account\/v1\/fulfillment_policy$/i,
  /^\/sell\/account\/v1\/payment_policy$/i,
  /^\/sell\/account\/v1\/return_policy$/i,
];

function normalizePathFromInput(pathOrUrl: string): string {
  try {
    return new URL(pathOrUrl).pathname;
  } catch {
    return pathOrUrl;
  }
}

export function isProductionWritePathAllowed(pathOrUrl: string): boolean {
  const normalizedPath = normalizePathFromInput(pathOrUrl);
  return PRODUCTION_WRITE_PATH_ALLOWLIST.some((pattern) => pattern.test(normalizedPath));
}

export function isMethodAllowed(method: string, pathOrUrl = ""): boolean {
  const normalizedMethod = method.toLowerCase();
  if (!SUPPORTED_CALLING_METHODS.includes(normalizedMethod as typeof SUPPORTED_CALLING_METHODS[number])) {
    return false;
  }

  if (USER_ENVIRONMENT === ApiEnvironment.SANDBOX) {
    return true;
  }

  if (READ_ONLY_METHODS.has(normalizedMethod)) {
    return true;
  }

  return EBAY_ALLOW_PRODUCTION_WRITES && isProductionWritePathAllowed(pathOrUrl);
}

export function getSupportedCallingMethods(pathOrUrl = ""): string[] {
  return SUPPORTED_CALLING_METHODS.filter((method) => isMethodAllowed(method, pathOrUrl));
}
