# 公司内部使用说明

这份说明用于公司内部员工接入 `ebay-listing-mcp`。

适用场景：
- 内部运营查看 listing 流量
- 内部运营通过 MCP 创建单 SKU 或多变体 listing
- 内部技术人员统一维护 eBay 应用配置

运营同事快速上手可直接看：
- [OPS_ONE_PAGE_CN.md](./OPS_ONE_PAGE_CN.md)

## 推荐方案

建议采用“公司统一 Developer App + 员工本地 seller profile 档案”的方式。

原因：
- 代码可以统一升级
- 公司只维护一套 eBay Developer Application
- 员工不需要各自申请 eBay Developer 账号
- 凭证不需要写进代码仓库
- 不同员工可以按店铺或角色隔离权限
- 问题定位最简单

## 内部交付方式

推荐做法：
1. 将仓库迁移到公司私有 GitHub 仓库，或只在公司内部 Git 服务保存。
2. 公司统一维护 `EBAY_CLIENT_ID`、`EBAY_CLIENT_SECRET`、`EBAY_REDIRECT_URI`。
3. 给员工只发仓库访问权限和基础 `.env` 模板，不发真实 seller token。
4. 员工首次授权后，token 按店铺写入自己电脑本地的 `.ebay-seller-profiles.json`。

不建议：
- 多个员工共用同一份 `.env`
- 把 `EBAY_CLIENT_SECRET`、`.ebay-seller-profiles.json`、`EBAY_USER_ACCESS_TOKEN`、`EBAY_USER_REFRESH_TOKEN` 提交进仓库
- 默认长期打开 `EBAY_ALLOW_PRODUCTION_WRITES=true`

## 员工安装流程

1. 克隆仓库

```bash
git clone <internal-repo-url>
cd ebay-listing-mcp
```

2. 安装依赖并构建

```bash
npm install
npm run build
```

3. 复制内部环境模板

```bash
cp .env.internal.example .env
```

4. 填写基础配置

至少填写：
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_REDIRECT_URI`
- `EBAY_API_ENV`
- `EBAY_MARKETPLACE_ID`
- `EBAY_CONTENT_LANGUAGE`
- `EBAY_SELLER_PROFILE_STORE`

如果员工只需要查流量，保持：
- `EBAY_ALLOW_PRODUCTION_WRITES=false`

如果员工需要上架，才改为：
- `EBAY_ALLOW_PRODUCTION_WRITES=true`

5. 在 MCP 客户端中接入

可参考 README 里的 `Codex`、`Cursor`、`Claude Desktop` 配置示例。

6. 首次授权

在 MCP 客户端里执行：
- `ebay_upsert_seller_profile`
  - 先为店铺建一个固定 `sellerProfileId`
  - 同时写好 `marketplaceId` 和 `contentLanguage`
- `ebay_get_oauth_url`
  - 浏览器打开返回的授权链接
  - 授权后复制浏览器地址栏里的完整回调 URL
- 调 `ebay_exchange_authorization_code`
  - 推荐传 `sellerProfileId`
  - 推荐传 `sellerProfileLabel`

完成后，MCP 会把 token 写入本地 `.ebay-seller-profiles.json`。

即使公司没有 ERP 或回调后端，也不影响这套流程。浏览器跳回已登记的 Accept URL 后，只要能从地址栏复制完整 URL，就可以完成换 token。

## 多店铺使用建议

如果一个员工要管理多个店铺，建议固定使用下面的流程：
1. 用 `ebay_get_oauth_url` 为每个店铺分别发起授权，并传不同的 `sellerProfileId`
2. 先用 `ebay_upsert_seller_profile` 给每个店铺预建本地档案
3. 用 `ebay_exchange_authorization_code` 把授权结果落到对应 `sellerProfileId`
4. 用 `ebay_list_seller_profiles` 查看这台机器已绑定的店铺
5. 用 `ebay_set_active_seller_profile` 切换默认店铺
6. 后续查询流量或上架时：
   - 要么继续显式传 `sellerProfileId`
   - 要么直接使用当前激活店铺
   - `marketplaceId` 和写接口需要的 `Content-Language` 不传时，会自动继承当前店铺档案

## 建议的角色权限

### 运营只读角色

用途：
- 查流量
- 看 listing 数据

建议：
- `EBAY_ALLOW_PRODUCTION_WRITES=false`
- 授权 scope 至少包含 `sell.analytics.readonly`

### 运营上架角色

用途：
- 查流量
- 创建和发布 listing

建议：
- 仅在需要时打开 `EBAY_ALLOW_PRODUCTION_WRITES=true`
- 使用单独的 seller 账号或单独的店铺环境

### 技术维护角色

用途：
- 维护仓库
- 升级 MCP
- 统一排障

建议：
- 不共享他人的 `.env`
- 不把本地 token 上传到任何仓库

## 凭证管理建议

建议由内部管理员统一分发以下内容：
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_REDIRECT_URI`

建议不要通过群聊长期传播：
- `EBAY_USER_ACCESS_TOKEN`
- `EBAY_USER_REFRESH_TOKEN`

更稳妥的做法：
- 员工自己完成 OAuth 授权
- token 自动回写到员工自己的 `.ebay-seller-profiles.json`

## 日常使用建议

推荐把使用场景拆开：

- 查流量时：
  - 默认只开只读配置
  - 常用工具：`ebay_get_traffic_report`

- 上架时：
  - 确认 `policy`、`location` 正确
  - 再打开 `EBAY_ALLOW_PRODUCTION_WRITES=true`
  - 常用工具：`ebay_list_fixed_price_item`、`ebay_list_multi_variation_item`

## 内部 SOP 建议

建议公司内部单独维护一份简短 SOP，至少包含：
- 员工安装步骤
- 授权步骤
- 流量查询示例
- 上架示例
- 常见报错处理

常见报错可以先按这三类判断：
- `Insufficient permissions`
  - 一般是缺 scope，需要重新授权
- `Invalid value for header Content-Language`
  - 检查 `EBAY_CONTENT_LANGUAGE` 是否为 `en-US`
- 业务字段校验错误
  - 检查分类、品牌、MPN、图片、policy、location

## 建议的内部升级方式

建议由技术维护人统一升级：

```bash
git pull
npm install
npm run build
npm test
```

然后再通知员工更新。

## 结论

如果是公司内部使用，这个 MCP 最合适的方式是：
- 私有仓库保存源码
- 公司统一维护 eBay Developer App
- 员工本地保存 `.env` 和 `.ebay-seller-profiles.json`
- 首次使用时按店铺各自授权
- 默认只读，按需开启生产写入
