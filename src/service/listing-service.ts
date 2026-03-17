import { type AxiosResponse } from "axios";
import * as https from "https";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DEFAULT_CONTENT_LANGUAGE,
  DEFAULT_MARKETPLACE_ID,
  DOMAIN_NAME,
  USER_ENVIRONMENT,
  isMethodAllowed,
} from "../constant/constants.js";
import { buildHeadersFromInput, formatAxiosError } from "../helper/http-helper.js";
import { authService } from "./auth-service.js";

const HTTPS_AGENT = new https.Agent({
  rejectUnauthorized: false,
});

const jsonObjectSchema = z.record(z.any());
const sellerProfileIdSchema = z.string().min(1).optional().describe("Optional seller profile ID. If omitted, the active seller profile is used.");

const priceSchema = z.object({
  value: z.string().min(1).describe("Price amount, for example 129.99."),
  currency: z.string().min(1).default("USD").describe("ISO currency code."),
});

const listingPoliciesSchema = z.object({
  fulfillmentPolicyId: z.string().min(1).describe("Existing fulfillment policy ID."),
  paymentPolicyId: z.string().min(1).describe("Existing payment policy ID."),
  returnPolicyId: z.string().min(1).describe("Existing return policy ID."),
});

const packageWeightAndSizeSchema = z.object({
  dimensions: z.object({
    height: z.number().positive().optional(),
    length: z.number().positive().optional(),
    unit: z.string().optional(),
    width: z.number().positive().optional(),
  }).optional(),
  packageType: z.string().optional(),
  weight: z.object({
    unit: z.string().optional(),
    value: z.number().positive().optional(),
  }).optional(),
}).optional();

const inventoryProductSchema = z.object({
  aspects: z.record(z.array(z.string())).optional().describe("Item specifics as arrays of string values."),
  brand: z.string().optional().describe("Brand value."),
  mpn: z.string().optional().describe("Manufacturer part number."),
  imageUrls: z.array(z.string().url()).optional().describe("Image URLs."),
  upc: z.array(z.string()).optional().describe("Optional UPC values."),
  ean: z.array(z.string()).optional().describe("Optional EAN values."),
  isbn: z.array(z.string()).optional().describe("Optional ISBN values."),
}).optional();

const listingInputSchema = {
  sellerProfileId: sellerProfileIdSchema,
  sku: z.string().min(1).describe("Seller-defined SKU."),
  title: z.string().min(1).max(80).describe("Listing title."),
  description: z.string().min(1).describe("Product description used for inventory and listing description."),
  categoryId: z.string().min(1).describe("Leaf category ID for the offer."),
  availableQuantity: z.number().int().positive().describe("Available quantity to sell."),
  merchantLocationKey: z.string().min(1).describe("Existing inventory location key."),
  condition: z.string().min(1).describe("Inventory condition, for example NEW."),
  price: priceSchema,
  marketplaceId: z.string().default(DEFAULT_MARKETPLACE_ID).describe("Marketplace ID, defaults to EBAY_US."),
  listingDuration: z.string().default("GTC").describe("Listing duration, usually GTC."),
  listingPolicies: listingPoliciesSchema,
  product: inventoryProductSchema,
  packageWeightAndSize: packageWeightAndSizeSchema,
  quantityLimitPerBuyer: z.number().int().positive().optional().describe("Optional quantity limit per buyer."),
};

const createInventoryLocationInputSchema = {
  sellerProfileId: sellerProfileIdSchema,
  merchantLocationKey: z.string().min(1).describe("Seller-defined inventory location key."),
  location: jsonObjectSchema.describe("Raw create inventory location payload that matches the Inventory API request body."),
};

const createPolicyInputSchema = {
  sellerProfileId: sellerProfileIdSchema,
  policy: jsonObjectSchema.describe("Raw Account API policy payload. marketplaceId defaults to EBAY_US if omitted."),
};

const createInventoryItemGroupInputSchema = {
  sellerProfileId: sellerProfileIdSchema,
  inventoryItemGroupKey: z.string().min(1).describe("Seller-defined inventory item group key."),
  group: jsonObjectSchema.describe("Raw inventory item group payload. variantSKUs, aspects, and variesBy should follow the Inventory API schema."),
};

const variationSpecificationSchema = z.object({
  name: z.string().min(1).describe("Variation aspect name, for example Size or Color."),
  values: z.array(z.string().min(1)).min(1).describe("Allowed values for this varying aspect."),
});

const multiVariationVariantSchema = z.object({
  sku: z.string().min(1).describe("Variant SKU."),
  availableQuantity: z.number().int().positive().describe("Quantity for this variant."),
  condition: z.string().min(1).describe("Inventory condition, for example NEW."),
  price: priceSchema,
  aspects: z.record(z.array(z.string())).describe("Variant-specific item specifics, including values for all varying aspects."),
  imageUrls: z.array(z.string().url()).min(1).describe("Variant image URLs."),
  brand: z.string().optional().describe("Variant brand override."),
  mpn: z.string().optional().describe("Variant MPN."),
  upc: z.array(z.string()).optional().describe("Variant UPC values."),
  ean: z.array(z.string()).optional().describe("Variant EAN values."),
  isbn: z.array(z.string()).optional().describe("Variant ISBN values."),
  packageWeightAndSize: packageWeightAndSizeSchema,
});

const multiVariationInputSchema = {
  sellerProfileId: sellerProfileIdSchema,
  inventoryItemGroupKey: z.string().min(1).describe("Inventory item group key for the variation family."),
  title: z.string().min(1).max(80).describe("Shared variation listing title."),
  description: z.string().min(1).describe("Shared variation listing description."),
  subtitle: z.string().max(55).optional().describe("Optional subtitle for the inventory item group."),
  categoryId: z.string().min(1).describe("Leaf category ID for all variant offers."),
  merchantLocationKey: z.string().min(1).describe("Existing inventory location key."),
  marketplaceId: z.string().default(DEFAULT_MARKETPLACE_ID).describe("Marketplace ID, defaults to EBAY_US."),
  listingDuration: z.string().default("GTC").describe("Listing duration, usually GTC."),
  listingPolicies: listingPoliciesSchema,
  groupAspects: z.record(z.array(z.string())).describe("Shared item specifics applied to every variant."),
  groupImageUrls: z.array(z.string().url()).min(1).describe("Shared gallery images for the inventory item group."),
  variesBy: z.object({
    aspectsImageVariesBy: z.array(z.string().min(1)).min(1).describe("Aspect names that drive image differences."),
    specifications: z.array(variationSpecificationSchema).min(1).describe("Variation definitions and allowed values."),
  }),
  quantityLimitPerBuyer: z.number().int().positive().optional().describe("Optional quantity limit per buyer."),
  variants: z.array(multiVariationVariantSchema).min(2).describe("Per-variant inventory and price data."),
};

type ListingInput = z.infer<z.ZodObject<typeof listingInputSchema>>;
type MultiVariationInput = z.infer<z.ZodObject<typeof multiVariationInputSchema>>;

type InventoryProductPayload = {
  title: string;
  description: string;
  aspects?: Record<string, string[]>;
  brand?: string;
  mpn?: string;
  imageUrls?: string[];
  upc?: string[];
  ean?: string[];
  isbn?: string[];
};

type InventoryItemPayload = {
  sku: string;
  availableQuantity: number;
  condition: string;
  packageWeightAndSize?: z.infer<NonNullable<typeof packageWeightAndSizeSchema>>;
  product: InventoryProductPayload;
};

type OfferPayload = {
  sku: string;
  marketplaceId: string;
  categoryId: string;
  availableQuantity: number;
  merchantLocationKey: string;
  listingDescription: string;
  price: z.infer<typeof priceSchema>;
  listingDuration: string;
  quantityLimitPerBuyer?: number;
  listingPolicies: z.infer<typeof listingPoliciesSchema>;
};

type PolicySummary = {
  fulfillmentPolicy?: unknown;
  paymentPolicy?: unknown;
  returnPolicy?: unknown;
  inventoryLocation?: unknown;
};

function getApiBaseUrl(): string {
  return `https://${DOMAIN_NAME[USER_ENVIRONMENT]}`;
}

function ensureProductionWriteAllowed(method: "POST" | "PUT", path: string): void {
  if (!isMethodAllowed(method, path)) {
    throw new Error(
      "Production write access is disabled for this seller operation. Set EBAY_ALLOW_PRODUCTION_WRITES=true to enable controlled production listing calls.",
    );
  }
}

function normalizeLocationPayload(location: Record<string, unknown>): Record<string, unknown> {
  return {
    merchantLocationStatus: "ENABLED",
    locationTypes: ["WAREHOUSE"],
    ...location,
  };
}

function normalizePolicyPayload(policy: Record<string, unknown>): Record<string, unknown> {
  const normalizedPolicy: Record<string, unknown> = {
    marketplaceId: DEFAULT_MARKETPLACE_ID,
    ...policy,
  };

  if (!normalizedPolicy.categoryTypes) {
    normalizedPolicy.categoryTypes = [
      {
        name: "ALL_EXCLUDING_MOTORS_VEHICLES",
      },
    ];
  }

  return normalizedPolicy;
}

function validateVariationInput(input: MultiVariationInput): void {
  const variantSkus = input.variants.map((variant) => variant.sku);
  if (new Set(variantSkus).size !== variantSkus.length) {
    throw new Error("Each variant SKU must be unique within a multi-variation listing.");
  }

  const varyingAspectNames = input.variesBy.specifications.map((specification) => specification.name);
  const invalidImageAspects = input.variesBy.aspectsImageVariesBy.filter((aspectName) => !varyingAspectNames.includes(aspectName));
  if (invalidImageAspects.length > 0) {
    throw new Error(`aspectsImageVariesBy contains unknown variation aspects: ${invalidImageAspects.join(", ")}`);
  }

  for (const variant of input.variants) {
    const missingVaryingAspects = varyingAspectNames.filter((aspectName) => {
      const aspectValues = variant.aspects[aspectName];
      return !Array.isArray(aspectValues) || aspectValues.length === 0;
    });

    if (missingVaryingAspects.length > 0) {
      throw new Error(`Variant ${variant.sku} is missing values for varying aspects: ${missingVaryingAspects.join(", ")}`);
    }
  }
}

async function sellerRequest<T = unknown>(options: {
  method: "GET" | "POST" | "PUT";
  path: string;
  data?: unknown;
  includeContentLanguage?: boolean;
  sellerProfileId?: string;
}): Promise<AxiosResponse<T>> {
  const token = await authService.getAccessToken(true, options.sellerProfileId);
  const headers: Record<string, string> = {};
  if (options.includeContentLanguage) {
    headers["Content-Language"] = DEFAULT_CONTENT_LANGUAGE;
  }

  return authService.request<T>({
    url: `${getApiBaseUrl()}${options.path}`,
    method: options.method,
    data: options.data,
    headers: buildHeadersFromInput(headers, true, token),
    httpsAgent: HTTPS_AGENT,
  }, { preferUserToken: true, sellerProfileId: options.sellerProfileId });
}

async function sellerRequestData<T = unknown>(options: {
  method: "GET" | "POST" | "PUT";
  path: string;
  data?: unknown;
  includeContentLanguage?: boolean;
  sellerProfileId?: string;
}): Promise<T> {
  const response = await sellerRequest<T>(options);
  return response.data;
}

async function verifyPoliciesAndLocation(input: {
  sellerProfileId?: string;
  marketplaceId: string;
  merchantLocationKey: string;
  listingPolicies: z.infer<typeof listingPoliciesSchema>;
}): Promise<PolicySummary> {
  const [fulfillmentPolicy, paymentPolicy, returnPolicy, inventoryLocation] = await Promise.all([
    sellerRequestData({
      method: "GET",
      path: `/sell/account/v1/fulfillment_policy/${input.listingPolicies.fulfillmentPolicyId}`,
      sellerProfileId: input.sellerProfileId,
    }),
    sellerRequestData({
      method: "GET",
      path: `/sell/account/v1/payment_policy/${input.listingPolicies.paymentPolicyId}`,
      sellerProfileId: input.sellerProfileId,
    }),
    sellerRequestData({
      method: "GET",
      path: `/sell/account/v1/return_policy/${input.listingPolicies.returnPolicyId}`,
      sellerProfileId: input.sellerProfileId,
    }),
    sellerRequestData({
      method: "GET",
      path: `/sell/inventory/v1/location/${encodeURIComponent(input.merchantLocationKey)}`,
      sellerProfileId: input.sellerProfileId,
    }),
  ]);

  return {
    fulfillmentPolicy,
    paymentPolicy,
    returnPolicy,
    inventoryLocation,
  };
}

async function createInventoryLocation(
  merchantLocationKey: string,
  location: Record<string, unknown>,
  sellerProfileId?: string,
): Promise<Record<string, unknown>> {
  const path = `/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`;
  ensureProductionWriteAllowed("POST", path);

  const response = await sellerRequest({
    method: "POST",
    path,
    data: normalizeLocationPayload(location),
    sellerProfileId,
  });

  return {
    success: response.status >= 200 && response.status < 300,
    merchantLocationKey,
    status: response.status,
    response: response.data || null,
  };
}

async function createFulfillmentPolicy(policy: Record<string, unknown>, sellerProfileId?: string): Promise<unknown> {
  const path = "/sell/account/v1/fulfillment_policy";
  ensureProductionWriteAllowed("POST", path);
  return sellerRequestData({
    method: "POST",
    path,
    data: normalizePolicyPayload(policy),
    sellerProfileId,
  });
}

async function createPaymentPolicy(policy: Record<string, unknown>, sellerProfileId?: string): Promise<unknown> {
  const path = "/sell/account/v1/payment_policy";
  ensureProductionWriteAllowed("POST", path);
  return sellerRequestData({
    method: "POST",
    path,
    data: normalizePolicyPayload(policy),
    sellerProfileId,
  });
}

async function createReturnPolicy(policy: Record<string, unknown>, sellerProfileId?: string): Promise<unknown> {
  const path = "/sell/account/v1/return_policy";
  ensureProductionWriteAllowed("POST", path);
  return sellerRequestData({
    method: "POST",
    path,
    data: normalizePolicyPayload(policy),
    sellerProfileId,
  });
}

async function upsertInventoryItem(payload: InventoryItemPayload, sellerProfileId?: string): Promise<unknown> {
  const path = `/sell/inventory/v1/inventory_item/${encodeURIComponent(payload.sku)}`;
  ensureProductionWriteAllowed("PUT", path);

  return sellerRequestData({
    method: "PUT",
    path,
    data: {
      availability: {
        shipToLocationAvailability: {
          quantity: payload.availableQuantity,
        },
      },
      condition: payload.condition,
      packageWeightAndSize: payload.packageWeightAndSize,
      product: payload.product,
    },
    includeContentLanguage: true,
    sellerProfileId,
  });
}

async function createOffer(payload: OfferPayload, sellerProfileId?: string): Promise<{ offerId: string; [key: string]: unknown }> {
  const path = "/sell/inventory/v1/offer";
  ensureProductionWriteAllowed("POST", path);

  return sellerRequestData({
    method: "POST",
    path,
    data: {
      sku: payload.sku,
      marketplaceId: payload.marketplaceId,
      format: "FIXED_PRICE",
      availableQuantity: payload.availableQuantity,
      categoryId: payload.categoryId,
      merchantLocationKey: payload.merchantLocationKey,
      listingDescription: payload.listingDescription,
      listingDuration: payload.listingDuration,
      pricingSummary: {
        price: payload.price,
      },
      quantityLimitPerBuyer: payload.quantityLimitPerBuyer,
      listingPolicies: payload.listingPolicies,
    },
    includeContentLanguage: true,
    sellerProfileId,
  }) as Promise<{ offerId: string; [key: string]: unknown }>;
}

async function createOrReplaceInventoryItemGroup(
  inventoryItemGroupKey: string,
  group: Record<string, unknown>,
  sellerProfileId?: string,
): Promise<unknown> {
  const path = `/sell/inventory/v1/inventory_item_group/${encodeURIComponent(inventoryItemGroupKey)}`;
  ensureProductionWriteAllowed("PUT", path);

  return sellerRequestData({
    method: "PUT",
    path,
    data: group,
    includeContentLanguage: true,
    sellerProfileId,
  });
}

async function publishOffer(offerId: string, sellerProfileId?: string): Promise<unknown> {
  const path = `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`;
  ensureProductionWriteAllowed("POST", path);
  return sellerRequestData({
    method: "POST",
    path,
    data: {},
    includeContentLanguage: true,
    sellerProfileId,
  });
}

async function publishOfferByInventoryItemGroup(inventoryItemGroupKey: string, marketplaceId: string, sellerProfileId?: string): Promise<unknown> {
  const path = "/sell/inventory/v1/offer/publish_by_inventory_item_group";
  ensureProductionWriteAllowed("POST", path);
  return sellerRequestData({
    method: "POST",
    path,
    data: {
      inventoryItemGroupKey,
      marketplaceId,
    },
    includeContentLanguage: true,
    sellerProfileId,
  });
}

async function listFixedPriceItem(input: ListingInput): Promise<Record<string, unknown>> {
  const preflight = await verifyPoliciesAndLocation(input);
  await upsertInventoryItem({
    sku: input.sku,
    availableQuantity: input.availableQuantity,
    condition: input.condition,
    packageWeightAndSize: input.packageWeightAndSize,
    product: {
      title: input.title,
      description: input.description,
      aspects: input.product?.aspects,
      brand: input.product?.brand,
      mpn: input.product?.mpn,
      imageUrls: input.product?.imageUrls,
      upc: input.product?.upc,
      ean: input.product?.ean,
      isbn: input.product?.isbn,
    },
  }, input.sellerProfileId);
  const offer = await createOffer({
    sku: input.sku,
    marketplaceId: input.marketplaceId,
    categoryId: input.categoryId,
    availableQuantity: input.availableQuantity,
    merchantLocationKey: input.merchantLocationKey,
    listingDescription: input.description,
    listingDuration: input.listingDuration,
    price: input.price,
    quantityLimitPerBuyer: input.quantityLimitPerBuyer,
    listingPolicies: input.listingPolicies,
  }, input.sellerProfileId);
  const publish = await publishOffer(offer.offerId, input.sellerProfileId);

  return {
    success: true,
    sku: input.sku,
    offerId: offer.offerId,
    preflight,
    publish,
  };
}

async function listMultiVariationItem(input: MultiVariationInput): Promise<Record<string, unknown>> {
  validateVariationInput(input);
  const preflight = await verifyPoliciesAndLocation(input);

  const inventoryResults = [];
  for (const variant of input.variants) {
    const inventoryResult = await upsertInventoryItem({
      sku: variant.sku,
      availableQuantity: variant.availableQuantity,
      condition: variant.condition,
      packageWeightAndSize: variant.packageWeightAndSize,
      product: {
        title: input.title,
        description: input.description,
        aspects: {
          ...input.groupAspects,
          ...variant.aspects,
        },
        brand: variant.brand,
        mpn: variant.mpn,
        imageUrls: variant.imageUrls,
        upc: variant.upc,
        ean: variant.ean,
        isbn: variant.isbn,
      },
    }, input.sellerProfileId);
    inventoryResults.push({
      sku: variant.sku,
      inventoryResult,
    });
  }

  const inventoryItemGroup = await createOrReplaceInventoryItemGroup(input.inventoryItemGroupKey, {
    title: input.title,
    description: input.description,
    subtitle: input.subtitle,
    imageUrls: input.groupImageUrls,
    variantSKUs: input.variants.map((variant) => variant.sku),
    aspects: input.groupAspects,
    variesBy: input.variesBy,
  }, input.sellerProfileId);

  const offers = [];
  for (const variant of input.variants) {
    const offer = await createOffer({
      sku: variant.sku,
      marketplaceId: input.marketplaceId,
      categoryId: input.categoryId,
      availableQuantity: variant.availableQuantity,
      merchantLocationKey: input.merchantLocationKey,
      listingDescription: input.description,
      listingDuration: input.listingDuration,
      price: variant.price,
      quantityLimitPerBuyer: input.quantityLimitPerBuyer,
      listingPolicies: input.listingPolicies,
    }, input.sellerProfileId);
    offers.push({
      sku: variant.sku,
      offerId: offer.offerId,
    });
  }

  const publish = await publishOfferByInventoryItemGroup(input.inventoryItemGroupKey, input.marketplaceId, input.sellerProfileId);

  return {
    success: true,
    inventoryItemGroupKey: input.inventoryItemGroupKey,
    preflight,
    inventoryResults,
    inventoryItemGroup,
    offers,
    publish,
  };
}

export function registerListingTools(server: McpServer): void {
  server.tool(
    "ebay_create_inventory_location",
    "Create an inventory location required by Inventory API listing flows.",
    createInventoryLocationInputSchema,
    async (input) => {
      try {
        const result = await createInventoryLocation(
          input.merchantLocationKey,
          input.location as Record<string, unknown>,
          input.sellerProfileId,
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: formatAxiosError(error) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "ebay_create_fulfillment_policy",
    "Create a fulfillment policy used by fixed-price and variation listings.",
    createPolicyInputSchema,
    async (input) => {
      try {
        const result = await createFulfillmentPolicy(input.policy as Record<string, unknown>, input.sellerProfileId);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: formatAxiosError(error) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "ebay_create_payment_policy",
    "Create a payment policy used by fixed-price and variation listings.",
    createPolicyInputSchema,
    async (input) => {
      try {
        const result = await createPaymentPolicy(input.policy as Record<string, unknown>, input.sellerProfileId);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: formatAxiosError(error) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "ebay_create_return_policy",
    "Create a return policy used by fixed-price and variation listings.",
    createPolicyInputSchema,
    async (input) => {
      try {
        const result = await createReturnPolicy(input.policy as Record<string, unknown>, input.sellerProfileId);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: formatAxiosError(error) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "ebay_create_or_replace_inventory_item_group",
    "Create or replace an inventory item group for a multi-variation listing.",
    createInventoryItemGroupInputSchema,
    async (input) => {
      try {
        const result = await createOrReplaceInventoryItemGroup(
          input.inventoryItemGroupKey,
          input.group as Record<string, unknown>,
          input.sellerProfileId,
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: formatAxiosError(error) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "ebay_list_fixed_price_item",
    "Create or replace an inventory item, create an offer, and publish a fixed-price listing with controlled production writes.",
    listingInputSchema,
    async (input) => {
      try {
        const result = await listFixedPriceItem(input as ListingInput);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: formatAxiosError(error) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "ebay_list_multi_variation_item",
    "Create inventory items, create an inventory item group, create offers for each SKU, and publish a multi-variation listing.",
    multiVariationInputSchema,
    async (input) => {
      try {
        const result = await listMultiVariationItem(input as MultiVariationInput);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: formatAxiosError(error) },
          ],
          isError: true,
        };
      }
    },
  );
}
