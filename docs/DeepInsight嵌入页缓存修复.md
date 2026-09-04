# DeepInsight 嵌入页缓存修复（2026-09-03）

## 原因与源码修正

外层 `http://81.70.49.200:3002/expert/chat` 的 iframe 指向
`http://152.136.106.161:3001/chat`。修复后的脚本已上线，但跨站 iframe 仍加载旧 HTML
所引用的 `index-DNjXgBHm.js`，而直接访问已加载
`index-DNjXgBHm-stream-post-b824e1c126.js`。

`packages/app-cmcc/src/utils/cmcc-experts.ts` 中为该 iframe 增加
`?v=stream-post-b824e1c126`，使浏览器请求新入口。已有版本参数不应被临时兼容脚本覆盖。
不要删除旧 JS：已打开页面的动态导入仍可能依赖它。

## 3001 长期缓存策略（已部署）

在 `152.136.106.161:/etc/nginx/nginx.conf` 的 `listen 3001` server 中增加：

```nginx
location = /index.html {
    add_header Cache-Control "no-cache" always;
}
```

保留原 `try_files $uri $uri/ /index.html`。`/chat` 和版本化入口均经回落返回该响应头。
此配置不会强制淘汰浏览器已经缓存的旧响应，因此本次仍需 iframe 版本参数。

备份：`/home/ubuntu/deploy-iframe-cache-20260903-2012/nginx.backup.conf`。
发布脚本会检查线上配置与原副本一致，并在校验或重载失败时恢复原配置。

## 3002 无应用重启兼容发布（已部署）

当前应用将 UI 打包在二进制中。为遵守不重启应用的项目约束，保留原二进制、原主脚本及
全部模块依赖，仅由 Nginx 在 HTML 入口中注入独立的兼容模块：

- 源码：`script/deploy/deepinsight-iframe-version.mjs`。
- 线上文件：`/opt/opencode-cmcc/iframe-cache-fix-20260903/deepinsight-iframe-version.mjs`。
- 公开地址：`/assets/deepinsight-iframe-version-b824e1c126.js`。
- Nginx 配置：`/etc/nginx/conf.d/dockapi.conf`。
- 配置备份：`/home/ubuntu/deploy-iframe-cache-20260903-2020/dockapi.backup.conf`。

兼容模块观察 iframe 挂载和 `src` 更新，仅对精确匹配的 DeepInsight 来源与 `/chat`
路径补充版本号，保留其他参数、片段和 sandbox；不会更改其他 iframe 或重复导航。

Nginx 使用默认仅匹配 `text/html` 的 `sub_filter`，在当前入口
`/assets/index-CVNu7Cv8.js` 的 module 标签前增加兼容模块标签。外部脚本仍符合原 CSP，
内联主题脚本与其 CSP 哈希不变。没有改写或重新发布原应用 JS。

对于 `Accept: text/html` 请求，三个 `dockapi_iframe_fix_*` map 清空上游请求的
`If-None-Match`、`If-Modified-Since` 和 `Accept-Encoding`，确保旧缓存不会得到不含补丁的
304，同时让 HTML 可被过滤。其他请求保留原请求头，`/api/` 代理不变。

### 后续正式发布与撤回

正式构建会直接使用源码中的版本化 URL。部署该构建后，确认 iframe 地址和新版脚本，再
移除这次临时添加的三个 map、对应的三个 proxy_set_header、sub_filter 指令和兼容模块
location。若其间配置已变更，不要用整份历史备份覆盖；只撤回本次增加的配置段。

临时补丁仅匹配旧构建的入口标签，不会自动注入后续不同哈希的正式构建。
兼容模块和旧资源可先保留；不要原地修改标记为 immutable 的已发布文件。

所有配置改动必须先 `nginx -t`，通过后平滑 reload Nginx，不重启应用。

## 验证

从 `script/deploy` 目录执行：

```sh
node --test deepinsight-iframe-version.test.mjs
```

从 `packages/app-cmcc` 执行 `bun typecheck`。

线上检查：

1. `/chat`、`/chat?v=stream-post-b824e1c126` 返回 `Cache-Control: no-cache`。
2. 外层 HTML 返回兼容模块标签；带 `Accept: text/html` 和旧条件缓存头时也应返回它。
3. Chrome 中 iframe 的实际 `src` 带版本号，内部脚本为
   `index-DNjXgBHm-stream-post-b824e1c126.js`。
4. 使用原长问题验证安全拦截信息，不推进正式报告生成。
5. 原外层主脚本逐字节不变，应用 PID 在发布前后保持一致。

本次实测：上述检查通过，应用 PID 保持 `212507`；3 项兼容模块测试和前端类型检查通过。
在 Chrome 外层嵌入页提交原 1215 字符问题后，页面显示“安全性验证 / 已拦截”、
“黑名单拦截”和“含敏感词信息，根据相关法律法规，此问题不予显示”，未生成正式报告。
