// 站点展示名与域名集中配置。
// 换域名：改 wrangler.toml 第 1 行 name（决定 *.workers.dev），并同步改下面 siteUrl。
// 业务组件禁止硬编码品牌词 / 域名 / localStorage 前缀，一律从这里取。

export const siteName = '念佛器';
export const siteSubtitle = '念佛计数';
export const siteUrl = 'https://buddha.wupengbo125.workers.dev';

// localStorage 命名空间前缀：集中在此，settings 的 key 由它派生。
// 换品牌时只需改本文件（与 siteUrl 一起），业务代码不动。
export const storageNamespace = 'buddha';

// 换域名说明文案，展示在设置区 / readme 中复用
export const domainNote = '换域名 = 改 wrangler.toml 的 name + 改 lib/brand.ts 的 siteUrl（两处）';
