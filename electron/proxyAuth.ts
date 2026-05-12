import fs from 'node:fs'
import path from 'node:path'
import type { BrowserProfile } from './types'

/**
 * Chromium deliberately ignores user:password embedded in --proxy-server URLs (M76+).
 * The supported way to authenticate to an HTTP/HTTPS proxy is to install a tiny extension
 * that registers chrome.webRequest.onAuthRequired and returns the credentials. This file
 * owns that extension: one folder per profile, regenerated on every launch so credential
 * edits take effect without manual cleanup.
 *
 * SECURITY NOTE: the credentials are written plain-text into the profile dir. That file
 * never leaves the user's machine, and the profile dir is already where cookies etc. live,
 * so the threat model is the same as the rest of the app. If we ever want stronger
 * protection, OS keychain + keytar at read-time is the follow-up.
 */

const EXTENSION_DIR_NAME = 'auto-registry-proxy-auth-extension'

export function proxyAuthRequired(profile: BrowserProfile): boolean {
  return Boolean(profile.proxy.username && profile.proxy.password)
}

export function clearProxyAuthExtension(profile: BrowserProfile): void {
  const extensionPath = path.join(profile.profilePath, EXTENSION_DIR_NAME)
  if (!fs.existsSync(extensionPath)) return
  try {
    fs.rmSync(extensionPath, { recursive: true, force: true })
  } catch {
    // Non-fatal: stale extension at worst triggers an extra Chromium warning.
  }
}

/**
 * Writes the proxy-auth extension for this profile and returns the absolute path so the
 * caller can append it to --load-extension. Returns undefined when credentials are absent,
 * and also cleans up any previously generated extension directory to avoid leaking stale
 * credentials after the user clears the auth fields.
 */
export function ensureProxyAuthExtension(profile: BrowserProfile): string | undefined {
  if (!proxyAuthRequired(profile)) {
    clearProxyAuthExtension(profile)
    return undefined
  }

  const extensionPath = path.join(profile.profilePath, EXTENSION_DIR_NAME)
  fs.mkdirSync(extensionPath, { recursive: true })

  const manifest = {
    manifest_version: 3,
    name: 'Auto Registry Proxy Auth',
    version: '1.0.0',
    description: 'Injects proxy credentials for the owning environment.',
    // minimum_chrome_version kept conservative; we target recent Chromium kernels anyway
    permissions: ['proxy', 'webRequest', 'webRequestAuthProvider'],
    host_permissions: ['<all_urls>'],
    background: {
      service_worker: 'background.js'
    }
  }

  const credentials = {
    host: profile.proxy.host,
    port: profile.proxy.port,
    username: profile.proxy.username,
    password: profile.proxy.password
  }

  // Chromium can fire onAuthRequired multiple times for the same request if we keep handing
  // it the same bad credentials; the pendingRequests guard stops us from auth-looping and
  // eating the user's session minutes.
  const background = `
const CREDENTIALS = ${JSON.stringify(credentials)};
const pendingRequests = new Set();

chrome.webRequest.onAuthRequired.addListener(
  (details) => {
    // Only answer challenges coming from the proxy we configured, not origin sites.
    if (!details.isProxy) return {};
    if (pendingRequests.has(details.requestId)) {
      // We already tried these credentials for this request; let Chromium fall through.
      return { cancel: true };
    }
    pendingRequests.add(details.requestId);
    return {
      authCredentials: {
        username: CREDENTIALS.username,
        password: CREDENTIALS.password
      }
    };
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

const forget = (details) => pendingRequests.delete(details.requestId);
chrome.webRequest.onCompleted.addListener(forget, { urls: ['<all_urls>'] });
chrome.webRequest.onErrorOccurred.addListener(forget, { urls: ['<all_urls>'] });
`

  fs.writeFileSync(path.join(extensionPath, 'manifest.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(extensionPath, 'background.js'), background)
  return extensionPath
}
