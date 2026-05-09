# Auto Registry

跨境账号环境管理桌面 MVP。它用 Electron 管理多个独立浏览器环境，每个环境有自己的持久化会话、代理和指纹配置。

## 功能

- 新增、编辑、删除浏览器环境
- 默认代理：`127.0.0.1:7890`
- 每个 profile 独立选择**目标系统**（Windows / Mac / Linux / 随机），UA、字体、WebGL 按目标平台生成
- Windows 宿主自动使用 itbrowser 内核做原生指纹伪装；其他平台 fallback 到 Chromium + JS 注入扩展
- 内核首次启动按需下载到 userData 目录
- 每个环境使用独立 user-data-dir 保存 Cookie 和登录态
- 点击启动后打开对应环境浏览器窗口

## 启动

```bash
pnpm install
pnpm run dev
```

## 浏览器内核与指纹

每个 profile 都可以指定**目标系统**（Windows / Mac / Linux / 随机），UA、平台、字体、WebGL renderer 会按该平台生成，不再绑定宿主机。

启动时根据宿主和目标系统自动选择内核：

| 宿主 | 目标 OS | 使用的内核 | 指纹方式 |
| --- | --- | --- | --- |
| Windows | Windows | itbrowser（如已安装） | 原生（`--itbrowser=fingerprint.json`） |
| 任意 | 任意 | Chromium | JS 注入扩展（开发态自带 `.browsers/chromium`） |

首次启动若内核缺失，应用会弹出引导窗口下载到 `<userData>/registry-data/browsers/`：

- Chromium：通过 `@puppeteer/browsers` 下载（约 150 MB）
- itbrowser：从 GitHub release 下载 7z（约 250 MB），用 `7zip-bin` 解压；仅 Windows 宿主可用

环境变量仍向后兼容，可强制覆盖：

```bash
AUTO_REGISTRY_BROWSER_PATH="/path/to/chrome"  pnpm run dev
AUTO_REGISTRY_FINGERPRINT_MODE=off            pnpm run dev   # off | extension | itbrowser
```

## 打包

```bash
pnpm dist:mac     # mac dmg + zip（arm64 + x64）
pnpm dist:win     # win nsis（x64）
pnpm dist:linux   # linux AppImage（x64）
pnpm dist:all     # 三平台一起
```

产物在 `release/` 下。安装包不内置浏览器内核，首次启动按需下载。

## 构建检查

```bash
pnpm run build
```

## 数据位置

```txt
<userData>/registry-data/profiles.json
<userData>/registry-data/profiles/<env-id>/
<userData>/registry-data/plugins/
<userData>/registry-data/browsers/{chromium,itbrowser}/
```

当前 MVP 适合本机账号环境隔离和运营管理。后续可以继续加团队权限、代理检测、批量导入、平台模板和 Chromium 独立进程模式。
