import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DOMAIN_NAME, USER_ENVIRONMENT } from "../constant/constants.js";
import { formatAxiosError } from "../helper/http-helper.js";
import { authService } from "./auth-service.js";

const DEFAULT_TRAFFIC_METRICS = [
  "LISTING_IMPRESSION_TOTAL",
  "LISTING_VIEWS_TOTAL",
  "CLICK_THROUGH_RATE",
  "SALES_CONVERSION_RATE",
  "TRANSACTION",
] as const;

const trafficMetricSchema = z.enum([
  "CLICK_THROUGH_RATE",
  "LISTING_IMPRESSION_SEARCH_RESULTS_PAGE",
  "LISTING_IMPRESSION_STORE",
  "LISTING_IMPRESSION_TOTAL",
  "LISTING_VIEWS_SOURCE_DIRECT",
  "LISTING_VIEWS_SOURCE_OFF_EBAY",
  "LISTING_VIEWS_SOURCE_OTHER_EBAY",
  "LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE",
  "LISTING_VIEWS_SOURCE_STORE",
  "LISTING_VIEWS_TOTAL",
  "SALES_CONVERSION_RATE",
  "TOTAL_IMPRESSION_TOTAL",
  "TRANSACTION",
]);

const getTrafficReportInputSchema = {
  sellerProfileId: z.string().min(1).optional().describe("Optional seller profile ID. If omitted, the active seller profile is used."),
  listingIds: z.array(z.string().min(1)).max(200).optional().describe("Optional listing IDs. If omitted, eBay can return up to 200 recent listings for the marketplace."),
  marketplaceId: z.string().optional().describe("Optional marketplace ID used when listingIds are omitted. Defaults to the current seller profile marketplace."),
  dateFrom: z.string().min(1).describe("Start date in YYYY-MM-DD or YYYYMMDD format."),
  dateTo: z.string().min(1).describe("End date in YYYY-MM-DD or YYYYMMDD format."),
  metrics: z.array(trafficMetricSchema).min(1).default([...DEFAULT_TRAFFIC_METRICS]).describe("Traffic metrics to request."),
  sort: z.string().optional().describe("Optional sort metric. Prefix with - for descending, for example -LISTING_IMPRESSION_TOTAL."),
};

type GetTrafficReportInput = z.infer<z.ZodObject<typeof getTrafficReportInputSchema>>;

function normalizeDate(dateValue: string): string {
  const compact = dateValue.replace(/-/g, "");
  if (/^\d{8}$/.test(compact)) {
    return compact;
  }

  throw new Error(`Unsupported date format: ${dateValue}. Use YYYY-MM-DD or YYYYMMDD.`);
}

function buildTrafficFilter(input: GetTrafficReportInput): string {
  const filters = [];

  if (input.listingIds && input.listingIds.length > 0) {
    filters.push(`listing_ids:{${input.listingIds.join("|")}}`);
  } else {
    filters.push(`marketplace_ids:{${input.marketplaceId}}`);
  }

  filters.push(`date_range:[${normalizeDate(input.dateFrom)}..${normalizeDate(input.dateTo)}]`);
  return filters.join(",");
}

async function getTrafficReport(input: GetTrafficReportInput): Promise<unknown> {
  const sellerContext = authService.getSellerContext(input.sellerProfileId);
  const requestInput = {
    ...input,
    marketplaceId: input.marketplaceId || sellerContext.marketplaceId,
  };
  const params = new URLSearchParams({
    dimension: "LISTING",
    filter: buildTrafficFilter(requestInput),
    metric: input.metrics.join(","),
  });

  if (input.sort) {
    params.set("sort", input.sort);
  }

  const response = await authService.request({
    url: `https://${DOMAIN_NAME[USER_ENVIRONMENT]}/sell/analytics/v1/traffic_report?${params.toString()}`,
    method: "GET",
  }, {
    preferUserToken: true,
    sellerProfileId: input.sellerProfileId,
  });

  return response.data;
}

export function registerAnalyticsTools(server: McpServer): void {
  server.tool(
    "ebay_get_traffic_report",
    "Read listing traffic metrics such as impressions, views, click-through rate, conversion rate, and transactions.",
    getTrafficReportInputSchema,
    async (input) => {
      try {
        const result = await getTrafficReport(input as GetTrafficReportInput);
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
