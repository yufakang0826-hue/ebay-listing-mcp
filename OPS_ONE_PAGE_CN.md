# 运营同事一页纸操作手册

这份手册给日常使用 MCP 的运营同事，目标是少看说明、直接能用。

## 你能用它做什么

- 查某个 listing 的曝光、访问、点击率、转化率、成交量
- 创建单 SKU listing
- 创建多变体 listing

## 第一次使用

1. 打开已经配置好这个 MCP 的 `Codex / Cursor / Claude Desktop`
2. 先执行 `ebay_upsert_seller_profile`
3. 再执行 `ebay_get_oauth_url`
4. 打开返回的授权链接
5. eBay 授权完成后，把浏览器地址栏里的完整回调 URL 交给 `ebay_exchange_authorization_code`
6. 看到成功返回后，就可以开始用

如果你只查流量，不需要开启生产写入。  
如果你要上架，技术同事会提前帮你确认是否允许写入生产环境。

如果你要管理多个店铺，找技术同事确认两件事：
- 这次授权对应的 `sellerProfileId`
- 当前激活的默认店铺是不是你要操作的店铺

## 最常用的 3 个工具

### 1. 查流量

工具：
- `ebay_get_traffic_report`

适合看：
- 曝光
- 访问
- 点击率
- 转化率
- 成交量

示例：

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
  ]
}
```

### 2. 上架单 SKU

工具：
- `ebay_list_fixed_price_item`

你通常需要提前准备：
- 标题
- 描述
- 分类
- 价格
- 图片
- 品牌
- MPN
- policy 和 location

### 3. 上架多变体

工具：
- `ebay_list_multi_variation_item`

你通常需要提前准备：
- 公共标题和描述
- 变体项，例如颜色、尺码
- 每个 SKU 的价格、库存、图片、MPN

## 运营最常见的使用顺序

### 先看数据，再决定要不要改

1. 先用 `ebay_get_traffic_report` 看最近 7 天或 14 天
2. 判断问题在哪：
   - 曝光低：标题、分类、图片主图可能有问题
   - 访问低：主图、价格、标题吸引力可能不足
   - 转化低：详情、价格、变体结构、评价、运费时效可能有问题
3. 再决定是否让技术或上架同事改 listing

## 给技术同事时，最好一次性提供这些信息

- `listingId`
- 你想看的时间范围
- 当前问题
  - 曝光低
  - 访问低
  - 转化低
- 你想改什么
  - 标题
  - 图片
  - 描述
  - 价格
  - 变体

## 常见报错怎么判断

### `Insufficient permissions`

含义：
- 当前授权不够

处理：
- 重新授权

### `Invalid value for header Content-Language`

含义：
- 环境配置不对

处理：
- 让技术同事检查 `EBAY_CONTENT_LANGUAGE` 是否是 `en-US`

### 业务字段错误

含义：
- 上架字段不满足 eBay 要求

处理：
- 检查分类、品牌、MPN、图片、policy、location

## 安全规则

- 不要把自己的 `.env` 发给别人
- 不要把 `.ebay-seller-profiles.json` 发给别人
- 不要把 token 发到群里
- 不确定能不能上架时，先只查流量
- 生产上架前，先确认使用的是正确店铺

## 一句话版本

运营最常用的动作就是：
- 先查流量
- 再判断问题
- 再让技术或上架同事改 listing
