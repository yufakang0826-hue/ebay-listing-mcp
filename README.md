# eBay API MCP Server

This MCP server is narrowed to one job: seller listing workflows on eBay.

It is derived from `eBay/npm-public-api-mcp`, but trimmed down to listing-only seller operations.

It now supports:
- seller OAuth authorization-code flow
- listing traffic analytics
- controlled production writes for fixed-price, multi-variation, and listing-setup workflows

## Phase 1 Scope

This fork adds production-safe seller tooling for:

1. `POST /sell/inventory/v1/location/{merchantLocationKey}`
2. `POST /sell/account/v1/fulfillment_policy`
3. `POST /sell/account/v1/payment_policy`
4. `POST /sell/account/v1/return_policy`
5. `PUT /sell/inventory/v1/inventory_item/{sku}`
6. `PUT /sell/inventory/v1/inventory_item_group/{inventoryItemGroupKey}`
7. `POST /sell/inventory/v1/offer`
8. `POST /sell/inventory/v1/offer/{offerId}/publish`
9. `POST /sell/inventory/v1/offer/publish_by_inventory_item_group`

Production writes stay blocked unless you explicitly enable them with `EBAY_ALLOW_PRODUCTION_WRITES=true`.

## Requirements

- Node.js 22+
- an eBay developer application
- a seller account with Business Policies enabled
- existing policy IDs for:
  - fulfillment policy
  - payment policy
  - return policy
- an existing inventory location key

## Installation

```bash
npm install
npm run build
```

Create a local env file from the example before starting:

```bash
cp .env.example .env
```

## Environment Variables

### Required for seller OAuth

| Variable | Description |
|----------|-------------|
| `EBAY_CLIENT_ID` | eBay application client ID |
| `EBAY_CLIENT_SECRET` | eBay application client secret |
| `EBAY_REDIRECT_URI` | eBay RuName / redirect URI |

### Optional token storage

| Variable | Description |
|----------|-------------|
| `EBAY_USER_ACCESS_TOKEN` | Seller user access token |
| `EBAY_USER_ACCESS_TOKEN_EXPIRY` | Access token expiry as timestamp or ISO date |
| `EBAY_USER_REFRESH_TOKEN` | Seller refresh token |
| `EBAY_USER_REFRESH_TOKEN_EXPIRY` | Refresh token expiry as timestamp or ISO date |
| `EBAY_APP_ACCESS_TOKEN` | App token for read-only OpenAPI calls |
| `EBAY_APP_ACCESS_TOKEN_EXPIRY` | App token expiry as timestamp or ISO date |
| `EBAY_CLIENT_TOKEN` | Legacy fallback token |

### Runtime options

| Variable | Description | Default |
|----------|-------------|---------|
| `EBAY_API_ENV` | `production` or `sandbox` | `production` |
| `EBAY_MARKETPLACE_ID` | Seller marketplace ID | `EBAY_US` |
| `EBAY_CONTENT_LANGUAGE` | Content-Language used on Inventory API writes | `en-US` |
| `EBAY_ALLOW_PRODUCTION_WRITES` | Enables allowlisted write calls in production | `false` |
| `EBAY_API_DOC_URL_FILE` | Optional local OpenAPI doc config file | unset |

## MCP Tools

### Auth tools

- `ebay_get_oauth_url`
- `ebay_exchange_authorization_code`
- `ebay_refresh_access_token`
- `ebay_get_token_status`

### Listing tools

- `ebay_get_traffic_report`
- `ebay_list_fixed_price_item`
- `ebay_list_multi_variation_item`

### Setup tools

- `ebay_create_inventory_location`
- `ebay_create_fulfillment_policy`
- `ebay_create_payment_policy`
- `ebay_create_return_policy`
- `ebay_create_or_replace_inventory_item_group`

The high-level listing tools perform:
- business policy preflight
- inventory location preflight
- inventory item upsert
- offer creation
- single-SKU publish or inventory item group publish

`ebay_get_traffic_report` reads listing-level metrics such as impressions, views, click-through rate, conversion rate, and transactions.

For Inventory API writes in `EBAY_US`, keep `EBAY_CONTENT_LANGUAGE=en-US` unless you have a marketplace-specific reason to change it.

## OAuth Flow

### 1. Start the server

```bash
EBAY_CLIENT_ID=your-client-id \
EBAY_CLIENT_SECRET=your-client-secret \
EBAY_REDIRECT_URI=your-ru-name \
npm start
```

### 2. Ask your MCP client to generate an auth URL

Use `ebay_get_oauth_url`.

Default scopes include:
- `https://api.ebay.com/oauth/api_scope`
- `https://api.ebay.com/oauth/api_scope/sell.inventory`
- `https://api.ebay.com/oauth/api_scope/sell.account`
- `https://api.ebay.com/oauth/api_scope/sell.analytics.readonly`

If you already authorized an older version of this MCP, re-authorize once so the stored user token also includes `sell.analytics.readonly`.

### 3. Authorize in the browser

Open the returned URL, sign in, and approve access.

### 4. Exchange the authorization code

Use `ebay_exchange_authorization_code` with the `code` query parameter returned by eBay.

The server writes refreshed tokens into `.env` in the current working directory.

## Production Write Safety

In `production`, generic writes are blocked by default.

Allowed production write paths in this fork are limited to:
- `/sell/inventory/v1/location/{merchantLocationKey}`
- `/sell/account/v1/fulfillment_policy`
- `/sell/account/v1/payment_policy`
- `/sell/account/v1/return_policy`
- `/sell/inventory/v1/inventory_item/{sku}`
- `/sell/inventory/v1/inventory_item_group/{inventoryItemGroupKey}`
- `/sell/inventory/v1/offer`
- `/sell/inventory/v1/offer/{offerId}/publish`
- `/sell/inventory/v1/offer/publish_by_inventory_item_group`

To enable them:

```bash
EBAY_ALLOW_PRODUCTION_WRITES=true npm start
```

Any non-allowlisted production write still fails local validation.

## Example Listing Request

Use `ebay_get_traffic_report` with a payload like:

```json
{
  "listingIds": ["147161526107"],
  "dateFrom": "2026-03-01",
  "dateTo": "2026-03-17",
  "metrics": [
    "LISTING_IMPRESSION_TOTAL",
    "LISTING_VIEWS_TOTAL",
    "CLICK_THROUGH_RATE",
    "SALES_CONVERSION_RATE",
    "TRANSACTION"
  ],
  "sort": "-LISTING_IMPRESSION_TOTAL"
}
```

Use `ebay_list_fixed_price_item` with a payload like:

```json
{
  "sku": "SKU-123",
  "title": "Tactical Plate Carrier Vest",
  "description": "Single-SKU fixed-price listing created through MCP.",
  "categoryId": "300263",
  "availableQuantity": 10,
  "merchantLocationKey": "main-warehouse",
  "condition": "NEW",
  "marketplaceId": "EBAY_US",
  "price": {
    "value": "129.99",
    "currency": "USD"
  },
  "listingPolicies": {
    "fulfillmentPolicyId": "FULFILLMENT_POLICY_ID",
    "paymentPolicyId": "PAYMENT_POLICY_ID",
    "returnPolicyId": "RETURN_POLICY_ID"
  },
  "product": {
    "brand": "Lehao",
    "mpn": "VEST-L-BLK",
    "imageUrls": [
      "https://example.com/image-1.jpg"
    ],
    "aspects": {
      "Brand": ["Lehao"],
      "MPN": ["VEST-L-BLK"],
      "Color": ["Black"],
      "Size": ["L"]
    }
  }
}
```

Use `ebay_list_multi_variation_item` with a payload like:

```json
{
  "inventoryItemGroupKey": "carrier-vest-2026",
  "title": "Lehao Tactical Plate Carrier Vest",
  "description": "Multi-variation fixed-price listing created through MCP.",
  "categoryId": "300263",
  "merchantLocationKey": "main-warehouse",
  "marketplaceId": "EBAY_US",
  "listingPolicies": {
    "fulfillmentPolicyId": "FULFILLMENT_POLICY_ID",
    "paymentPolicyId": "PAYMENT_POLICY_ID",
    "returnPolicyId": "RETURN_POLICY_ID"
  },
  "groupAspects": {
    "Brand": ["Lehao"],
    "Department": ["Adults"],
    "Type": ["Plate Carrier"]
  },
  "groupImageUrls": [
    "https://example.com/vest-main-1.jpg",
    "https://example.com/vest-main-2.jpg"
  ],
  "variesBy": {
    "aspectsImageVariesBy": ["Color"],
    "specifications": [
      { "name": "Color", "values": ["Black", "Green"] },
      { "name": "Size", "values": ["M", "L"] }
    ]
  },
  "variants": [
    {
      "sku": "VEST-BLK-M",
      "availableQuantity": 5,
      "condition": "NEW",
      "price": { "value": "129.99", "currency": "USD" },
      "aspects": {
        "Color": ["Black"],
        "Size": ["M"]
      },
      "imageUrls": [
        "https://example.com/vest-black-m.jpg"
      ],
      "brand": "Lehao",
      "mpn": "VEST-BLK-M"
    },
    {
      "sku": "VEST-GRN-L",
      "availableQuantity": 4,
      "condition": "NEW",
      "price": { "value": "134.99", "currency": "USD" },
      "aspects": {
        "Color": ["Green"],
        "Size": ["L"]
      },
      "imageUrls": [
        "https://example.com/vest-green-l.jpg"
      ],
      "brand": "Lehao",
      "mpn": "VEST-GRN-L"
    }
  ]
}
```

## Client Config Examples

Replace the absolute path and credentials before use.

### Codex

```json
{
  "mcpServers": {
    "ebay-listing": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "C:\\absolute\\path\\to\\ebay-listing-mcp",
      "env": {
        "EBAY_API_ENV": "production",
        "EBAY_CLIENT_ID": "YOUR_CLIENT_ID",
        "EBAY_CLIENT_SECRET": "YOUR_CLIENT_SECRET",
        "EBAY_REDIRECT_URI": "YOUR_RUNAME",
        "EBAY_MARKETPLACE_ID": "EBAY_US",
        "EBAY_CONTENT_LANGUAGE": "en-US",
        "EBAY_ALLOW_PRODUCTION_WRITES": "true"
      }
    }
  }
}
```

### Cursor

```json
{
  "mcpServers": {
    "ebay-listing": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/ebay-listing-mcp",
      "env": {
        "EBAY_API_ENV": "production",
        "EBAY_CLIENT_ID": "YOUR_CLIENT_ID",
        "EBAY_CLIENT_SECRET": "YOUR_CLIENT_SECRET",
        "EBAY_REDIRECT_URI": "YOUR_RUNAME",
        "EBAY_MARKETPLACE_ID": "EBAY_US",
        "EBAY_CONTENT_LANGUAGE": "en-US",
        "EBAY_ALLOW_PRODUCTION_WRITES": "true"
      }
    }
  }
}
```

### Claude Desktop

```json
{
  "mcpServers": {
    "ebay-listing": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/ebay-listing-mcp",
      "env": {
        "EBAY_API_ENV": "production",
        "EBAY_CLIENT_ID": "YOUR_CLIENT_ID",
        "EBAY_CLIENT_SECRET": "YOUR_CLIENT_SECRET",
        "EBAY_REDIRECT_URI": "YOUR_RUNAME",
        "EBAY_MARKETPLACE_ID": "EBAY_US",
        "EBAY_CONTENT_LANGUAGE": "en-US",
        "EBAY_ALLOW_PRODUCTION_WRITES": "true"
      }
    }
  }
}
```

## Share This Repo

If you publish this repository to GitHub, other users can:
- clone it
- copy `.env.example` to `.env`
- run `npm install`
- run `npm run build`
- point their MCP client at `dist/index.js`

For company-only rollout, see [INTERNAL_USAGE_CN.md](./INTERNAL_USAGE_CN.md) and start from [.env.internal.example](./.env.internal.example).

## Validation and Tests

```bash
npm run build
npm test
```

Integration tests are opt-in:

```bash
RUN_EBAY_MCP_INTEGRATION_TESTS=true npm test
```

## Limitations

- this is still Phase 1 and focuses on the core listing lifecycle
- policy payloads and inventory-location payloads are passed through with light defaults, not full field-by-field validation
- production writes are intentionally limited to a small allowlist

## License

Apache 2.0
