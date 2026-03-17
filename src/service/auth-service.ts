import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import * as fs from "fs";
import * as path from "path";
import {
  ApiEnvironment,
  CORE_APP_SCOPE,
  DEFAULT_CONTENT_LANGUAGE,
  DEFAULT_MARKETPLACE_ID,
  DEFAULT_USER_SCOPES,
  OAUTH_DOMAIN_NAME,
  TOKEN_ENDPOINT,
  USER_ENVIRONMENT,
} from "../constant/constants.js";

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type?: string;
  scope?: string;
}

interface TokenStatus {
  authenticated: boolean;
  currentTokenType: "user" | "app" | "legacy" | "none";
  hasUserAccessToken: boolean;
  hasRefreshToken: boolean;
  hasAppAccessToken: boolean;
  environment: ApiEnvironment;
  marketplaceId: string;
  contentLanguage: string;
}

function parseExpiry(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const numeric = Number(value);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return numeric > 1e12 ? numeric : numeric * 1000;
  }

  const dateValue = Date.parse(value);
  if (Number.isNaN(dateValue)) {
    return undefined;
  }

  return dateValue;
}

function updateEnvFile(updates: Record<string, string>): void {
  const envPath = path.join(process.cwd(), ".env");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${JSON.stringify(String(value))}`;
    const matcher = new RegExp(`^(#\\s*)?${key}=.*$`, "gm");
    if (matcher.test(envContent)) {
      envContent = envContent.replace(matcher, line);
    } else {
      envContent += `${envContent.endsWith("\n") || envContent.length === 0 ? "" : "\n"}${line}\n`;
    }
    process.env[key] = value;
  }

  fs.writeFileSync(envPath, envContent, "utf-8");
}

class EbayAuthService {
  private get clientId(): string {
    return process.env.EBAY_CLIENT_ID || "";
  }

  private get clientSecret(): string {
    return process.env.EBAY_CLIENT_SECRET || "";
  }

  private get redirectUri(): string {
    return process.env.EBAY_REDIRECT_URI || "";
  }

  private get legacyToken(): string {
    return process.env.EBAY_CLIENT_TOKEN || "";
  }

  private get userAccessToken(): string {
    return process.env.EBAY_USER_ACCESS_TOKEN || "";
  }

  private get refreshToken(): string {
    return process.env.EBAY_USER_REFRESH_TOKEN || "";
  }

  private get appAccessToken(): string {
    return process.env.EBAY_APP_ACCESS_TOKEN || "";
  }

  private get userAccessTokenExpiry(): number | undefined {
    return parseExpiry(process.env.EBAY_USER_ACCESS_TOKEN_EXPIRY);
  }

  private get refreshTokenExpiry(): number | undefined {
    return parseExpiry(process.env.EBAY_USER_REFRESH_TOKEN_EXPIRY);
  }

  private get appAccessTokenExpiry(): number | undefined {
    return parseExpiry(process.env.EBAY_APP_ACCESS_TOKEN_EXPIRY);
  }

  private hasClientCredentials(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private hasAnyToken(): boolean {
    return Boolean(this.legacyToken || this.userAccessToken || this.refreshToken || this.appAccessToken);
  }

  private tokenIsFresh(token: string, expiry?: number): boolean {
    if (!token) {
      return false;
    }
    if (!expiry) {
      return true;
    }
    return Date.now() < expiry - 60_000;
  }

  private async fetchToken(
    grantType: "client_credentials" | "refresh_token" | "authorization_code",
    payload: Record<string, string>,
  ): Promise<AccessTokenResponse> {
    if (!this.hasClientCredentials()) {
      throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are required for OAuth token exchange");
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const response = await axios.post<AccessTokenResponse>(
      TOKEN_ENDPOINT[USER_ENVIRONMENT],
      new URLSearchParams({ grant_type: grantType, ...payload }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
      },
    );
    return response.data;
  }

  private persistUserTokens(tokenData: AccessTokenResponse): void {
    const now = Date.now();
    const updates: Record<string, string> = {
      EBAY_USER_ACCESS_TOKEN: tokenData.access_token,
      EBAY_USER_ACCESS_TOKEN_EXPIRY: String(now + tokenData.expires_in * 1000),
    };

    if (tokenData.refresh_token) {
      updates.EBAY_USER_REFRESH_TOKEN = tokenData.refresh_token;
    }
    if (tokenData.refresh_token_expires_in) {
      updates.EBAY_USER_REFRESH_TOKEN_EXPIRY = String(now + tokenData.refresh_token_expires_in * 1000);
    }

    updateEnvFile(updates);
  }

  private persistAppToken(tokenData: AccessTokenResponse): void {
    const now = Date.now();
    updateEnvFile({
      EBAY_APP_ACCESS_TOKEN: tokenData.access_token,
      EBAY_APP_ACCESS_TOKEN_EXPIRY: String(now + tokenData.expires_in * 1000),
    });
  }

  private getAppScopes(): string {
    return CORE_APP_SCOPE;
  }

  getStartupErrors(): string[] {
    if (this.hasAnyToken()) {
      return [];
    }

    if (this.hasClientCredentials()) {
      return [];
    }

    return [
      "Authentication is not configured. Provide one of: EBAY_CLIENT_TOKEN, EBAY_APP_ACCESS_TOKEN, EBAY_USER_ACCESS_TOKEN, or EBAY_CLIENT_ID/EBAY_CLIENT_SECRET.",
    ];
  }

  getOAuthAuthorizationUrl(scopes?: string[]): string {
    if (!this.clientId || !this.redirectUri) {
      throw new Error("EBAY_CLIENT_ID and EBAY_REDIRECT_URI are required to generate an OAuth URL");
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
    });
    params.set("scope", (scopes && scopes.length > 0 ? scopes : DEFAULT_USER_SCOPES).join(" "));

    return `https://${OAUTH_DOMAIN_NAME[USER_ENVIRONMENT]}/oauth2/authorize?${params.toString()}`;
  }

  async exchangeAuthorizationCode(code: string): Promise<AccessTokenResponse> {
    if (!this.redirectUri) {
      throw new Error("EBAY_REDIRECT_URI is required to exchange an authorization code");
    }

    const decodedCode = decodeURIComponent(code);
    const tokenData = await this.fetchToken("authorization_code", {
      code: decodedCode,
      redirect_uri: this.redirectUri,
    });
    this.persistUserTokens(tokenData);
    return tokenData;
  }

  async refreshUserAccessToken(): Promise<string> {
    if (!this.refreshToken) {
      throw new Error("EBAY_USER_REFRESH_TOKEN is not set");
    }
    if (!this.hasClientCredentials()) {
      throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are required to refresh a user token");
    }
    if (this.refreshTokenExpiry && Date.now() >= this.refreshTokenExpiry) {
      throw new Error("EBAY_USER_REFRESH_TOKEN is expired and must be re-authorized");
    }

    const tokenData = await this.fetchToken("refresh_token", {
      refresh_token: this.refreshToken,
    });
    this.persistUserTokens(tokenData);
    return tokenData.access_token;
  }

  private async getOrCreateAppToken(): Promise<string> {
    if (this.tokenIsFresh(this.appAccessToken, this.appAccessTokenExpiry)) {
      return this.appAccessToken;
    }
    if (!this.hasClientCredentials()) {
      if (this.legacyToken) {
        return this.legacyToken;
      }
      throw new Error("No app token available and EBAY_CLIENT_ID/EBAY_CLIENT_SECRET are missing");
    }

    const tokenData = await this.fetchToken("client_credentials", {
      scope: this.getAppScopes(),
    });
    this.persistAppToken(tokenData);
    return tokenData.access_token;
  }

  async getAccessToken(preferUserToken = true): Promise<string> {
    if (preferUserToken) {
      if (this.tokenIsFresh(this.userAccessToken, this.userAccessTokenExpiry)) {
        return this.userAccessToken;
      }
      if (this.refreshToken) {
        return this.refreshUserAccessToken();
      }
    }

    if (this.tokenIsFresh(this.appAccessToken, this.appAccessTokenExpiry)) {
      return this.appAccessToken;
    }
    if (this.legacyToken) {
      return this.legacyToken;
    }
    if (!preferUserToken && this.tokenIsFresh(this.userAccessToken, this.userAccessTokenExpiry)) {
      return this.userAccessToken;
    }

    return this.getOrCreateAppToken();
  }

  async request<T = unknown>(
    config: AxiosRequestConfig,
    options: { preferUserToken?: boolean; retryOnAuthFailure?: boolean } = {},
  ): Promise<AxiosResponse<T>> {
    const preferUserToken = options.preferUserToken ?? true;
    const token = await this.getAccessToken(preferUserToken);
    const headers = {
      ...(config.headers || {}),
      Authorization: `Bearer ${token}`,
    };

    try {
      return await axios.request<T>({
        ...config,
        headers,
      });
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 401 &&
        options.retryOnAuthFailure !== false &&
        preferUserToken &&
        this.refreshToken
      ) {
        const refreshedToken = await this.refreshUserAccessToken();
        return axios.request<T>({
          ...config,
          headers: {
            ...(config.headers || {}),
            Authorization: `Bearer ${refreshedToken}`,
          },
        });
      }
      throw error;
    }
  }

  getTokenStatus(): TokenStatus {
    let currentTokenType: TokenStatus["currentTokenType"] = "none";
    if (this.tokenIsFresh(this.userAccessToken, this.userAccessTokenExpiry)) {
      currentTokenType = "user";
    } else if (this.tokenIsFresh(this.appAccessToken, this.appAccessTokenExpiry)) {
      currentTokenType = "app";
    } else if (this.legacyToken) {
      currentTokenType = "legacy";
    }

    return {
      authenticated: currentTokenType !== "none" || this.hasClientCredentials(),
      currentTokenType,
      hasUserAccessToken: Boolean(this.userAccessToken),
      hasRefreshToken: Boolean(this.refreshToken),
      hasAppAccessToken: Boolean(this.appAccessToken || this.legacyToken),
      environment: USER_ENVIRONMENT,
      marketplaceId: process.env.EBAY_MARKETPLACE_ID || DEFAULT_MARKETPLACE_ID,
      contentLanguage: process.env.EBAY_CONTENT_LANGUAGE || DEFAULT_CONTENT_LANGUAGE,
    };
  }
}

export const authService = new EbayAuthService();
