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
