# Auto Registry

跨境账号环境管理桌面 MVP。它用 Electron 管理多个独立浏览器环境，每个环境有自己的持久化会话、代理和指纹配置。

## 功能

- 新增、编辑、删除浏览器环境
- 默认代理：`127.0.0.1:7890`
- 不填写指纹时自动生成 User-Agent、语言、时区、分辨率、平台、WebGL 等参数
- 每个环境使用独立 Electron session partition 保存 Cookie 和登录态
- 点击启动后打开对应环境浏览器窗口

## 启动

```bash
pnpm install
pnpm run dev
```

## 浏览器与指纹模式

项目不绑定某个特定 Chromium 内核。默认会使用 `.browsers` 中由 `@puppeteer/browsers` 安装的 Chrome/Chromium，也可以指定任意可执行浏览器路径：

```bash
AUTO_REGISTRY_BROWSER_PATH="/path/to/chrome-or-chromium" pnpm run dev
```

指纹逻辑默认使用通用模式：

- `AUTO_REGISTRY_FINGERPRINT_MODE=extension`：默认值。通过启动参数和运行时扩展改写 UA、语言、时区、屏幕、WebGL、Canvas、Audio、WebRTC 等常见指纹面，适用于标准 Chrome/Chromium。
- `AUTO_REGISTRY_FINGERPRINT_MODE=itbrowser`：在通用模式基础上额外生成 `fingerprint.json` 并传入 `--itbrowser=<path>`，仅适用于支持该私有参数的自定义 Chromium。
- `AUTO_REGISTRY_FINGERPRINT_MODE=off`：关闭指纹改写，只保留独立用户目录、代理和启动 URL。

兼容旧环境变量：

```bash
AUTO_REGISTRY_CHROMIUM="/path/to/chrome" AUTO_REGISTRY_ENABLE_FINGERPRINT=1 pnpm run dev
```

其中 `AUTO_REGISTRY_ENABLE_FINGERPRINT=1` 会映射到 `itbrowser` 模式；新配置建议使用 `AUTO_REGISTRY_FINGERPRINT_MODE`。

## 构建检查

```bash
pnpm run build
```

## 数据位置

运行后环境配置保存在 Electron 的 userData 目录下：

```txt
registry-data/profiles.json
registry-data/profiles/<env-id>/
```

当前 MVP 适合本机账号环境隔离和运营管理。后续可以继续加团队权限、代理检测、批量导入、平台模板和 Chromium 独立进程模式。
