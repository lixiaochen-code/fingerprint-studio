/**
 * 在 Electron 打包后(.app / .exe / .AppImage)环境里,让 esbuild 找到能 spawn 的
 * 平台二进制。
 *
 * ## 问题
 *
 * esbuild 运行时通过 `require.resolve('@esbuild/<platform>/bin/esbuild')` 拿到二进制
 * 路径,然后 `child_process.spawn` 它。在 Electron 打包后,这条路径会落到
 * `.../app.asar/node_modules/@esbuild/<platform>/bin/esbuild` —— `app.asar` 是文件
 * 不是目录,Node 的 fs.* IO 通过 Electron 的 asar 钩子能读出文件内容,但
 * `child_process.spawn` 直接给 OS,**asar 钩子不参与**,OS 把 `app.asar/...` 当成
 * "在文件里继续走目录",报 `ENOTDIR`。
 *
 * 同时 `asarUnpack: ['**\/node_modules/@esbuild/**']` 已经把二进制额外复制了一份到
 * `.../app.asar.unpacked/node_modules/@esbuild/<platform>/bin/esbuild`,这份是真实
 * 文件系统路径,可以 spawn。问题只是要让 esbuild 用第二份。
 *
 * ## 方案
 *
 * esbuild 提供了 `ESBUILD_BINARY_PATH` 环境变量;一旦设置,esbuild 会**完全跳过**
 * 它自己的 `require.resolve` 逻辑,直接 spawn 这个路径。我们在 bootstrap 顶端把它
 * 设到 `.asar.unpacked` 那份的绝对路径即可。
 *
 * dev 模式 (`pnpm run dev`) `__dirname` 不在 .asar 内,replace 是 noop,行为不变。
 *
 * ## 跨平台
 *
 * `@esbuild/<platform>` 包名拼装规则与 esbuild 内部 `pkgForCurrentPlatform` 完全
 * 一致(详见 esbuild lib/main.js 的 packageDarwin_arm64 / packageWin32_x64 表)。
 * 我们只在当前平台的 hoist 树里能找到对应包,其它平台的 stub 包是空的(pnpm 的
 * optionalDependencies 机制),不会误打开。
 */
import path from 'node:path'

/**
 * Electron 打包后的 asar 段名。Linux/Win 也是 'app.asar',跨平台一致。
 * 用 path.sep 包起来避免 'foo-app.asar-bar' 这种 false positive。
 */
const ASAR_FRAGMENT = `${path.sep}app.asar${path.sep}`
const ASAR_UNPACKED_FRAGMENT = `${path.sep}app.asar.unpacked${path.sep}`

/**
 * @esbuild 平台包命名规则。直接抄 esbuild 自身的 pkgForCurrentPlatform。
 *
 * 不导出常量数组而是函数:每次调时按当前 process.platform/arch 算,在某些
 * Rosetta 场景(macOS arm64 host 跑 x64 node)下不会算错。
 */
function platformPackage(): string {
  // 与 esbuild 0.27+ 内部表对齐;若 esbuild 升级新增平台,这里要同步扩
  const map: Record<string, string> = {
    'darwin arm64': '@esbuild/darwin-arm64',
    'darwin x64': '@esbuild/darwin-x64',
    'linux arm64': '@esbuild/linux-arm64',
    'linux x64': '@esbuild/linux-x64',
    'linux ia32': '@esbuild/linux-ia32',
    'win32 arm64': '@esbuild/win32-arm64',
    'win32 x64': '@esbuild/win32-x64',
    'win32 ia32': '@esbuild/win32-ia32'
  }
  const key = `${process.platform} ${process.arch}`
  const pkg = map[key]
  if (!pkg) {
    throw new Error(`esbuild-binary: unsupported platform/arch combo "${key}"`)
  }
  return pkg
}

/**
 * Windows 上二进制名是 esbuild.exe,其它平台是 esbuild。
 */
function binaryName(): string {
  return process.platform === 'win32' ? 'esbuild.exe' : 'esbuild'
}

/**
 * 算出当前进程应该用的 esbuild 平台二进制绝对路径,并把 .asar 段替换成
 * .asar.unpacked。dev 模式没有 .asar 段时直接返回 require.resolve 的原值。
 *
 * 失败(找不到包)→ 返回 null,调用方决定是吞掉还是 throw;此模块自身不抛,
 * 因为 `transformSync` 的兜底是"让 esbuild 自己报错信息更清楚",我们不要遮蔽它。
 */
function resolveUnpackedBinary(): string | null {
  let resolved: string
  try {
    resolved = require.resolve(`${platformPackage()}/bin/${binaryName()}`)
  } catch {
    return null
  }
  // 双段都替:asar 边界与 unpacked 边界都换。如果路径里没有 .asar 段(dev / 测试),
  // replace 是 noop。
  return resolved.includes(ASAR_FRAGMENT)
    ? resolved.replace(ASAR_FRAGMENT, ASAR_UNPACKED_FRAGMENT)
    : resolved
}

/**
 * bootstrap 应在 import esbuild 后、第一次调 transformSync 前调用一次。
 *
 * 设计:幂等。如果环境变量已经被外部显式设了(用户 / 父进程主动配置),不覆盖。
 * 在 dev 模式下,resolveUnpackedBinary 返回的路径不含 .asar,esbuild 自己原本
 * 也能 resolve 到这同一条,设不设 env 都对;为了一致行为我们仍然设。
 */
export function ensureEsbuildBinaryPath(): void {
  if (process.env.ESBUILD_BINARY_PATH) return // 用户已显式覆盖,不动
  const unpacked = resolveUnpackedBinary()
  if (!unpacked) return // 找不到就让 esbuild 自己报错,不静默兜底
  process.env.ESBUILD_BINARY_PATH = unpacked
}
