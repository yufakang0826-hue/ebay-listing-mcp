# eBay Listing MCP

本仓库按公司内部私有仓库使用维护。

这是一个聚焦 `eBay seller listing` 工作流的 MCP 服务。

它基于 `eBay/npm-public-api-mcp` 改造而来，但已经收敛成只做这几类事情：
- 卖家 OAuth 授权
- 多店铺 seller profile 管理
- listing 流量读取
- 单 SKU 上架
- 多变体上架
- location 和 business policy 前置配置

## 当前能力

这版 MCP 目前支持以下 eBay Seller API 能力：

1. `POST /sell/inventory/v1/location/{merchantLocationKey}`
2. `POST /sell/account/v1/fulfillment_policy`
3. `POST /sell/account/v1/payment_policy`
4. `POST /sell/account/v1/return_policy`
5. `PUT /sell/inventory/v1/inventory_item/{sku}`
6. `PUT /sell/inventory/v1/inventory_item_group/{inventoryItemGroupKey}`
7. `POST /sell/inventory/v1/offer`
8. `POST /sell/inventory/v1/offer/{offerId}/publish`
9. `POST /sell/inventory/v1/offer/publish_by_inventory_item_group`
10. `GET /sell/analytics/v1/traffic_report`

生产环境写操作默认关闭，只有显式设置 `EBAY_ALLOW_PRODUCTION_WRITES=true` 才会放开白名单里的写接口。

## 适用场景

- 在 MCP 客户端里做 eBay 单 SKU 上架
- 在 MCP 客户端里做 eBay 多变体上架
- 查询某个 listing 的曝光、访问、点击率、转化率、成交量
- 给内部运营或技术团队提供统一的 eBay listing 工具

## 环境要求

- Node.js 22+
- 一个可用的 eBay Developer Application
- 一个启用了 Business Policies 的卖家账号
- 可用的 business policy
  - fulfillment policy
  - payment policy
  - return policy
- 可用的 inventory location

## 安装

```bash
npm install
npm run build
```

先复制环境变量模板：

```bash
cp .env.example .env
```

如果是公司内部员工使用，优先参考：
- [INTERNAL_USAGE_CN.md](./INTERNAL_USAGE_CN.md)
- [.env.internal.example](./.env.internal.example)

## 环境变量说明

### OAuth 必填

| 变量名 | 说明 |
|--------|------|
| `EBAY_CLIENT_ID` | eBay 应用的 Client ID |
| `EBAY_CLIENT_SECRET` | eBay 应用的 Client Secret |
| `EBAY_REDIRECT_URI` | eBay OAuth 回调用的 RuName |

### Token 存储

| 变量名 | 说明 |
|--------|------|
| `EBAY_SELLER_PROFILE_STORE` | 可选，seller profile 档案文件路径，默认是当前目录下的 `.ebay-seller-profiles.json` |
| `EBAY_USER_ACCESS_TOKEN` | 卖家用户 access token |
| `EBAY_USER_ACCESS_TOKEN_EXPIRY` | access token 过期时间，支持时间戳或 ISO 日期 |
| `EBAY_USER_REFRESH_TOKEN` | 卖家用户 refresh token |
| `EBAY_USER_REFRESH_TOKEN_EXPIRY` | refresh token 过期时间，支持时间戳或 ISO 日期 |
| `EBAY_APP_ACCESS_TOKEN` | 只读 app token |
| `EBAY_APP_ACCESS_TOKEN_EXPIRY` | app token 过期时间 |
| `EBAY_CLIENT_TOKEN` | 兼容旧配置的 fallback token |

### 运行配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `EBAY_API_ENV` | `production` 或 `sandbox` | `production` |
| `EBAY_MARKETPLACE_ID` | 站点 ID | `EBAY_US` |
| `EBAY_CONTENT_LANGUAGE` | Inventory API 写请求使用的 `Content-Language` | `en-US` |
| `EBAY_ALLOW_PRODUCTION_WRITES` | 是否放开生产环境白名单写操作 | `false` |
| `EBAY_API_DOC_URL_FILE` | 可选，本地 OpenAPI 配置文件 | 未设置 |

注意：
- `EBAY_US` 下建议保持 `EBAY_CONTENT_LANGUAGE=en-US`
- 只查流量时，建议保持 `EBAY_ALLOW_PRODUCTION_WRITES=false`
- 推荐在公司内部使用 `sellerProfileId`，把不同店铺 token 存到 `.ebay-seller-profiles.json`
- 如果不传 `sellerProfileId`，MCP 仍兼容旧模式，继续把 token 回写到 `.env`

## MCP 工具

### 认证工具

- `ebay_get_oauth_url`
- `ebay_exchange_authorization_code`
- `ebay_refresh_access_token`
- `ebay_get_token_status`
- `ebay_list_seller_profiles`
- `ebay_set_active_seller_profile`

### 流量工具

- `ebay_get_traffic_report`

这个工具可以读取 listing 维度的核心指标，例如：
- `LISTING_IMPRESSION_TOTAL`
- `LISTING_VIEWS_TOTAL`
- `CLICK_THROUGH_RATE`
- `SALES_CONVERSION_RATE`
- `TRANSACTION`

### 上架工具

- `ebay_list_fixed_price_item`
- `ebay_list_multi_variation_item`

### 前置配置工具

- `ebay_create_inventory_location`
- `ebay_create_fulfillment_policy`
- `ebay_create_payment_policy`
- `ebay_create_return_policy`
- `ebay_create_or_replace_inventory_item_group`

## OAuth 授权流程

### 1. 启动服务

```bash
EBAY_CLIENT_ID=your-client-id \
EBAY_CLIENT_SECRET=your-client-secret \
EBAY_REDIRECT_URI=your-ru-name \
npm start
```

### 2. 在 MCP 客户端里执行 `ebay_get_oauth_url`

默认会申请这些 scope：
- `https://api.ebay.com/oauth/api_scope`
- `https://api.ebay.com/oauth/api_scope/sell.inventory`
- `https://api.ebay.com/oauth/api_scope/sell.account`
- `https://api.ebay.com/oauth/api_scope/sell.analytics.readonly`

如果你之前授权过旧版本，需要重新授权一次，才能把 `sell.analytics.readonly` 一起写进新 token。

如果一台电脑要管理多个店铺，建议从第一天就带上 `sellerProfileId`，例如：

```json
{
  "sellerProfileId": "store-us-main"
}
```

### 3. 浏览器打开授权链接

登录 eBay 账号并完成授权。

### 4. 执行 `ebay_exchange_authorization_code`

没有 ERP 也可以继续。浏览器完成授权后，把地址栏里的整条回调 URL 直接传给这个工具就行。

推荐同时传入：

```json
{
  "code": "浏览器地址栏里的完整回调 URL",
  "sellerProfileId": "store-us-main",
  "sellerProfileLabel": "美国主店",
  "marketplaceId": "EBAY_US",
  "contentLanguage": "en-US"
}
```

这样 token 会写入 seller profile 档案文件，后续查流量和上架都可以按店铺切换。

如果不传 `sellerProfileId`，MCP 才会沿用旧模式，把 token 回写到 `.env`。

如果你在 `ebay_get_oauth_url` 阶段已经传了 `sellerProfileId`，MCP 也会尝试从回调 URL 的 `state` 自动还原这个店铺档案。

### 5. 查看或切换当前店铺

- 用 `ebay_list_seller_profiles` 查看当前机器已授权的店铺
- 用 `ebay_set_active_seller_profile` 设置默认店铺
- 之后 listing 和 analytics 工具如果省略 `sellerProfileId`，就会自动使用当前激活店铺

## 生产环境写入安全

在 `production` 环境下，通用写操作默认关闭。

当前只允许以下白名单写接口：
- `/sell/inventory/v1/location/{merchantLocationKey}`
- `/sell/account/v1/fulfillment_policy`
- `/sell/account/v1/payment_policy`
- `/sell/account/v1/return_policy`
- `/sell/inventory/v1/inventory_item/{sku}`
- `/sell/inventory/v1/inventory_item_group/{inventoryItemGroupKey}`
- `/sell/inventory/v1/offer`
- `/sell/inventory/v1/offer/{offerId}/publish`
- `/sell/inventory/v1/offer/publish_by_inventory_item_group`

要开启这些生产写入能力：

```bash
EBAY_ALLOW_PRODUCTION_WRITES=true npm start
```

任何不在白名单里的生产写操作，仍然会被本地校验拒绝。

## 请求示例

### 读取 listing 流量

```json
{
  "sellerProfileId": "store-us-main",
  "listingIds": ["147161526107"],
  "dateFrom": "2026-03-01",
  "dateTo": "2026-03-16",
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

### 单 SKU 上架

```json
{
  "sellerProfileId": "store-us-main",
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

### 多变体上架

```json
{
  "sellerProfileId": "store-us-main",
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

## MCP 客户端配置示例

先把绝对路径和凭证换成你自己的值。

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

## 公司内部使用

默认使用方式：
- 仓库保存在公司私有 GitHub 或内部 Git 服务
- 公司统一维护 `EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_REDIRECT_URI`
- 员工各自在本地维护自己的 `.env` 和 `.ebay-seller-profiles.json`
- 首次使用时各自对自己的 eBay 店铺完成 OAuth 授权
- 默认只读，按需开启 `EBAY_ALLOW_PRODUCTION_WRITES=true`

内部落地资料：
- [INTERNAL_USAGE_CN.md](./INTERNAL_USAGE_CN.md)
- [.env.internal.example](./.env.internal.example)
- [OPS_ONE_PAGE_CN.md](./OPS_ONE_PAGE_CN.md)

## 验证和测试

```bash
npm run build
npm test
```

集成测试默认不执行，需要时手动开启：

```bash
RUN_EBAY_MCP_INTEGRATION_TESTS=true npm test
```

## 当前限制

- 这还是 Phase 1，重点覆盖核心 listing 生命周期
- policy 和 inventory location 目前是轻量透传，不是完整字段级校验
- 生产环境写操作仍然只限白名单

## 许可证

Apache 2.0
