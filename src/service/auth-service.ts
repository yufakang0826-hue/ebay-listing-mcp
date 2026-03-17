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
import { sellerProfileStore, type SellerProfileRecord } from "./seller-profile-store.js";

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type?: string;
  scope?: string;
}

interface SellerProfileSummary {
  sellerProfileId: string;
  sellerProfileLabel?: string;
  marketplaceId?: string;
  contentLanguage?: string;
  hasUserAccessToken: boolean;
  hasRefreshToken: boolean;
  isActive: boolean;
  updatedAt: string;
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
  usingSellerProfileStore: boolean;
  sellerProfileId: string | null;
  sellerProfileLabel: string | null;
  activeSellerProfileId: string | null;
  availableSellerProfiles: SellerProfileSummary[];
}

interface ExchangeAuthorizationCodeOptions {
  sellerProfileId?: string;
  sellerProfileLabel?: string;
  marketplaceId?: string;
  contentLanguage?: string;
}

interface RequestOptions {
  preferUserToken?: boolean;
  retryOnAuthFailure?: boolean;
  sellerProfileId?: string;
}

interface ResolvedAuthorizationInput {
  authorizationCode: string;
  sellerProfileIdFromState?: string;
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

export function resolveAuthorizationInput(input: string): ResolvedAuthorizationInput {
  const trimmedInput = input.trim();

  try {
    const callbackUrl = new URL(trimmedInput);
    const error = callbackUrl.searchParams.get("error");
    const errorDescription = callbackUrl.searchParams.get("error_description");
    if (error) {
      throw new Error(`eBay authorization failed: ${error}${errorDescription ? ` (${errorDescription})` : ""}`);
    }

    const callbackCode = callbackUrl.searchParams.get("code");
    if (!callbackCode) {
      throw new Error("The callback URL does not contain a code parameter.");
    }

    return {
      authorizationCode: decodeURIComponent(callbackCode),
      sellerProfileIdFromState: callbackUrl.searchParams.get("state") || undefined,
    };
  } catch (error) {
    if (error instanceof TypeError) {
      return {
        authorizationCode: decodeURIComponent(trimmedInput),
      };
    }

    throw error;
  }
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

  private get envUserAccessToken(): string {
    return process.env.EBAY_USER_ACCESS_TOKEN || "";
  }

  private get envRefreshToken(): string {
    return process.env.EBAY_USER_REFRESH_TOKEN || "";
  }

  private get appAccessToken(): string {
    return process.env.EBAY_APP_ACCESS_TOKEN || "";
  }

  private get envUserAccessTokenExpiry(): number | undefined {
    return parseExpiry(process.env.EBAY_USER_ACCESS_TOKEN_EXPIRY);
  }

  private get envRefreshTokenExpiry(): number | undefined {
    return parseExpiry(process.env.EBAY_USER_REFRESH_TOKEN_EXPIRY);
  }

  private get appAccessTokenExpiry(): number | undefined {
    return parseExpiry(process.env.EBAY_APP_ACCESS_TOKEN_EXPIRY);
  }

  private hasClientCredentials(): boolean {
    return Boolean(this.clientId && this.clientSecret);
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

  private getAppScopes(): string {
    return CORE_APP_SCOPE;
  }

  private getSelectedProfileId(profileId?: string): string | undefined {
    return profileId || sellerProfileStore.getActiveProfileId();
  }

  private getSelectedProfile(profileId?: string): SellerProfileRecord | undefined {
    const selectedProfileId = this.getSelectedProfileId(profileId);
    return selectedProfileId ? sellerProfileStore.getProfile(selectedProfileId) : undefined;
  }

  private getProfileAccessToken(profileId?: string): string {
    return this.getSelectedProfile(profileId)?.userAccessToken || "";
  }

  private getProfileRefreshToken(profileId?: string): string {
    return this.getSelectedProfile(profileId)?.refreshToken || "";
  }

  private getProfileAccessTokenExpiry(profileId?: string): number | undefined {
    return parseExpiry(this.getSelectedProfile(profileId)?.userAccessTokenExpiry);
  }

  private getProfileRefreshTokenExpiry(profileId?: string): number | undefined {
    return parseExpiry(this.getSelectedProfile(profileId)?.refreshTokenExpiry);
  }

  private getProfileMarketplaceId(profileId?: string): string | undefined {
    return this.getSelectedProfile(profileId)?.marketplaceId;
  }

  private getProfileContentLanguage(profileId?: string): string | undefined {
    return this.getSelectedProfile(profileId)?.contentLanguage;
  }

  private persistUserTokens(tokenData: AccessTokenResponse, options: ExchangeAuthorizationCodeOptions = {}): void {
    const targetProfileId = options.sellerProfileId || sellerProfileStore.getActiveProfileId();
    const now = Date.now();

    if (targetProfileId) {
      sellerProfileStore.upsertProfile(targetProfileId, {
        sellerProfileLabel: options.sellerProfileLabel || this.getSelectedProfile(targetProfileId)?.sellerProfileLabel,
        marketplaceId: options.marketplaceId || this.getSelectedProfile(targetProfileId)?.marketplaceId || DEFAULT_MARKETPLACE_ID,
        contentLanguage: options.contentLanguage || this.getSelectedProfile(targetProfileId)?.contentLanguage || DEFAULT_CONTENT_LANGUAGE,
        userAccessToken: tokenData.access_token,
        userAccessTokenExpiry: String(now + tokenData.expires_in * 1000),
        refreshToken: tokenData.refresh_token || this.getSelectedProfile(targetProfileId)?.refreshToken,
        refreshTokenExpiry: tokenData.refresh_token_expires_in
          ? String(now + tokenData.refresh_token_expires_in * 1000)
          : this.getSelectedProfile(targetProfileId)?.refreshTokenExpiry,
      });
      sellerProfileStore.setActiveProfile(targetProfileId);
      return;
    }

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

  private listSellerProfileSummaries(): SellerProfileSummary[] {
    const activeSellerProfileId = sellerProfileStore.getActiveProfileId();
    return sellerProfileStore.listProfiles().map((profile) => ({
      sellerProfileId: profile.sellerProfileId,
      sellerProfileLabel: profile.sellerProfileLabel,
      marketplaceId: profile.marketplaceId,
      contentLanguage: profile.contentLanguage,
      hasUserAccessToken: Boolean(profile.userAccessToken),
      hasRefreshToken: Boolean(profile.refreshToken),
      isActive: profile.sellerProfileId === activeSellerProfileId,
      updatedAt: profile.updatedAt,
    }));
  }

  private ensureProfileHasUserTokens(profileId: string): void {
    const profile = sellerProfileStore.getProfile(profileId);
    if (!profile) {
      throw new Error(`Seller profile not found: ${profileId}`);
    }
    if (!profile.userAccessToken && !profile.refreshToken) {
      throw new Error(`Seller profile ${profileId} has no user tokens yet. Authorize it first.`);
    }
  }

  getStartupErrors(): string[] {
    const hasEnvTokens = Boolean(this.legacyToken || this.envUserAccessToken || this.envRefreshToken || this.appAccessToken);
    if (hasEnvTokens || sellerProfileStore.hasProfiles()) {
      return [];
    }

    if (this.hasClientCredentials()) {
      return [];
    }

    return [
      "Authentication is not configured. Provide one of: EBAY_CLIENT_TOKEN, EBAY_APP_ACCESS_TOKEN, EBAY_USER_ACCESS_TOKEN, or EBAY_CLIENT_ID/EBAY_CLIENT_SECRET.",
    ];
  }

  getOAuthAuthorizationUrl(scopes?: string[], state?: string): string {
    if (!this.clientId || !this.redirectUri) {
      throw new Error("EBAY_CLIENT_ID and EBAY_REDIRECT_URI are required to generate an OAuth URL");
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
    });
    params.set("scope", (scopes && scopes.length > 0 ? scopes : DEFAULT_USER_SCOPES).join(" "));
    if (state) {
      params.set("state", state);
    }

    return `https://${OAUTH_DOMAIN_NAME[USER_ENVIRONMENT]}/oauth2/authorize?${params.toString()}`;
  }

  async exchangeAuthorizationCode(code: string, options: ExchangeAuthorizationCodeOptions = {}): Promise<AccessTokenResponse> {
    if (!this.redirectUri) {
      throw new Error("EBAY_REDIRECT_URI is required to exchange an authorization code");
    }

    const resolvedInput = resolveAuthorizationInput(code);
    const tokenData = await this.fetchToken("authorization_code", {
      code: resolvedInput.authorizationCode,
      redirect_uri: this.redirectUri,
    });
    this.persistUserTokens(tokenData, {
      ...options,
      sellerProfileId: options.sellerProfileId || resolvedInput.sellerProfileIdFromState,
    });
    return tokenData;
  }

  async refreshUserAccessToken(profileId?: string): Promise<string> {
    const selectedProfileId = this.getSelectedProfileId(profileId);
    const refreshToken = selectedProfileId ? this.getProfileRefreshToken(selectedProfileId) : this.envRefreshToken;
    const refreshTokenExpiry = selectedProfileId ? this.getProfileRefreshTokenExpiry(selectedProfileId) : this.envRefreshTokenExpiry;

    if (!refreshToken) {
      if (selectedProfileId) {
        throw new Error(`Seller profile ${selectedProfileId} has no refresh token. Authorize it first.`);
      }
      throw new Error("EBAY_USER_REFRESH_TOKEN is not set");
    }
    if (!this.hasClientCredentials()) {
      throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are required to refresh a user token");
    }
    if (refreshTokenExpiry && Date.now() >= refreshTokenExpiry) {
      throw new Error(selectedProfileId
        ? `Seller profile ${selectedProfileId} refresh token is expired and must be re-authorized`
        : "EBAY_USER_REFRESH_TOKEN is expired and must be re-authorized");
    }

    const tokenData = await this.fetchToken("refresh_token", {
      refresh_token: refreshToken,
    });
    this.persistUserTokens(tokenData, {
      sellerProfileId: selectedProfileId,
      marketplaceId: this.getProfileMarketplaceId(selectedProfileId),
      contentLanguage: this.getProfileContentLanguage(selectedProfileId),
      sellerProfileLabel: this.getSelectedProfile(selectedProfileId)?.sellerProfileLabel,
    });
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

  async getAccessToken(preferUserToken = true, sellerProfileId?: string): Promise<string> {
    const selectedProfileId = this.getSelectedProfileId(sellerProfileId);

    if (preferUserToken) {
      if (selectedProfileId) {
        this.ensureProfileHasUserTokens(selectedProfileId);
        if (this.tokenIsFresh(this.getProfileAccessToken(selectedProfileId), this.getProfileAccessTokenExpiry(selectedProfileId))) {
          return this.getProfileAccessToken(selectedProfileId);
        }
        if (this.getProfileRefreshToken(selectedProfileId)) {
          return this.refreshUserAccessToken(selectedProfileId);
        }
        throw new Error(`Seller profile ${selectedProfileId} has no usable user token.`);
      }

      if (this.tokenIsFresh(this.envUserAccessToken, this.envUserAccessTokenExpiry)) {
        return this.envUserAccessToken;
      }
      if (this.envRefreshToken) {
        return this.refreshUserAccessToken();
      }
    }

    if (this.tokenIsFresh(this.appAccessToken, this.appAccessTokenExpiry)) {
      return this.appAccessToken;
    }
    if (this.legacyToken) {
      return this.legacyToken;
    }
    if (!preferUserToken && selectedProfileId && this.tokenIsFresh(this.getProfileAccessToken(selectedProfileId), this.getProfileAccessTokenExpiry(selectedProfileId))) {
      return this.getProfileAccessToken(selectedProfileId);
    }
    if (!preferUserToken && this.tokenIsFresh(this.envUserAccessToken, this.envUserAccessTokenExpiry)) {
      return this.envUserAccessToken;
    }

    return this.getOrCreateAppToken();
  }

  async request<T = unknown>(
    config: AxiosRequestConfig,
    options: RequestOptions = {},
  ): Promise<AxiosResponse<T>> {
    const preferUserToken = options.preferUserToken ?? true;
    const token = await this.getAccessToken(preferUserToken, options.sellerProfileId);
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
      const selectedProfileId = this.getSelectedProfileId(options.sellerProfileId);
      const hasRefreshToken = selectedProfileId ? Boolean(this.getProfileRefreshToken(selectedProfileId)) : Boolean(this.envRefreshToken);

      if (
        axios.isAxiosError(error) &&
        error.response?.status === 401 &&
        options.retryOnAuthFailure !== false &&
        preferUserToken &&
        hasRefreshToken
      ) {
        const refreshedToken = await this.refreshUserAccessToken(selectedProfileId);
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

  listSellerProfiles(): SellerProfileSummary[] {
    return this.listSellerProfileSummaries();
  }

  setActiveSellerProfile(profileId: string): SellerProfileSummary {
    const profile = sellerProfileStore.setActiveProfile(profileId);
    return {
      sellerProfileId: profile.sellerProfileId,
      sellerProfileLabel: profile.sellerProfileLabel,
      marketplaceId: profile.marketplaceId,
      contentLanguage: profile.contentLanguage,
      hasUserAccessToken: Boolean(profile.userAccessToken),
      hasRefreshToken: Boolean(profile.refreshToken),
      isActive: true,
      updatedAt: profile.updatedAt,
    };
  }

  getTokenStatus(profileId?: string): TokenStatus {
    const selectedProfileId = this.getSelectedProfileId(profileId);
    const selectedProfile = this.getSelectedProfile(profileId);
    const availableSellerProfiles = this.listSellerProfileSummaries();

    const hasUserAccessToken = selectedProfileId
      ? Boolean(selectedProfile?.userAccessToken)
      : Boolean(this.envUserAccessToken);
    const hasRefreshToken = selectedProfileId
      ? Boolean(selectedProfile?.refreshToken)
      : Boolean(this.envRefreshToken);

    let currentTokenType: TokenStatus["currentTokenType"] = "none";
    if (selectedProfileId) {
      if (this.tokenIsFresh(this.getProfileAccessToken(selectedProfileId), this.getProfileAccessTokenExpiry(selectedProfileId))) {
        currentTokenType = "user";
      } else if (this.tokenIsFresh(this.appAccessToken, this.appAccessTokenExpiry)) {
        currentTokenType = "app";
      } else if (this.legacyToken) {
        currentTokenType = "legacy";
      }
    } else if (this.tokenIsFresh(this.envUserAccessToken, this.envUserAccessTokenExpiry)) {
      currentTokenType = "user";
    } else if (this.tokenIsFresh(this.appAccessToken, this.appAccessTokenExpiry)) {
      currentTokenType = "app";
    } else if (this.legacyToken) {
      currentTokenType = "legacy";
    }

    return {
      authenticated: currentTokenType !== "none" || this.hasClientCredentials(),
      currentTokenType,
      hasUserAccessToken,
      hasRefreshToken,
      hasAppAccessToken: Boolean(this.appAccessToken || this.legacyToken),
      environment: USER_ENVIRONMENT,
      marketplaceId: selectedProfile?.marketplaceId || process.env.EBAY_MARKETPLACE_ID || DEFAULT_MARKETPLACE_ID,
      contentLanguage: selectedProfile?.contentLanguage || process.env.EBAY_CONTENT_LANGUAGE || DEFAULT_CONTENT_LANGUAGE,
      usingSellerProfileStore: Boolean(selectedProfileId),
      sellerProfileId: selectedProfileId || null,
      sellerProfileLabel: selectedProfile?.sellerProfileLabel || null,
      activeSellerProfileId: sellerProfileStore.getActiveProfileId() || null,
      availableSellerProfiles,
    };
  }
}

export const authService = new EbayAuthService();
