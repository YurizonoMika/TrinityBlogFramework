// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import vm from 'node:vm'
import AdmZip from 'adm-zip'
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  cpSync,
} from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getSetting,
  setSetting,
  getUserSetting,
  setUserSetting,
  db,
  DATA_DIR,
  primaryUserId,
} from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const PLUGINS_DIR = process.env.HOMEPAGE_PLUGINS_DIR || join(__dirname, '..', 'plugins')
// per-user plugin code + storage: DATA_DIR/users/<userId>/plugins/<pluginId>/
const USERS_DIR = join(DATA_DIR, 'users')

mkdirSync(PLUGINS_DIR, { recursive: true })
mkdirSync(USERS_DIR, { recursive: true })

const ID_RE = /^[a-z0-9][a-z0-9-]*$/

/**
 * Plugin SDK version advertised by the framework. Plugins may declare a minimum
 * required SDK via `minSdkVersion` in plugin.json; installing/loading a plugin
 * whose requirement is newer than this is refused.
 */
export const SDK_VERSION = '1.0.0'

function parseSemver(v) {
  return String(v || '')
    .split(/[.+-]/)
    .slice(0, 3)
    .map((n) => parseInt(n, 10) || 0)
}

/** Compare two semver-ish strings → -1 | 0 | 1. */
export function compareSemver(a, b) {
  const x = parseSemver(a)
  const y = parseSemver(b)
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
  }
  return 0
}

/** Whether the framework SDK satisfies a plugin's minimum requirement. */
export function sdkSatisfies(minSdkVersion) {
  if (!minSdkVersion) return true
  return compareSemver(SDK_VERSION, minSdkVersion) >= 0
}
const SCRIPT_TIMEOUT = 1500

// in-memory runtime registry: `${userId}:${id}` -> { manifest, dir, registrations }
const runtime = new Map()

function userPluginsRoot(userId) {
  return join(USERS_DIR, String(userId), 'plugins')
}
export function pluginDir(userId, id) {
  return join(userPluginsRoot(userId), id)
}
function usernameOf(userId) {
  const u = db.prepare('SELECT username FROM users WHERE id = ?').get(userId)
  return u ? u.username : ''
}

/* ------------------------------------------------------------------ */
/* per-plugin state (stored in the user's settings)                    */
/* ------------------------------------------------------------------ */

export function getPluginStates(userId) {
  return getUserSetting(userId, 'plugins', {}) || {}
}

function setPluginStates(userId, states) {
  setUserSetting(userId, 'plugins', states)
  invalidatePluginCache(userId)
}

/* ------------------------------------------------------------------ */
/* plugin storage (per user + plugin)                                  */
/* ------------------------------------------------------------------ */

function safeName(name) {
  const n = basename(String(name || ''))
  if (!n || n === '.' || n === '..' || n.includes('/') || n.includes('\\')) {
    throw new Error('无效的文件名')
  }
  return n
}

export function pluginStorageDir(userId, id) {
  if (!ID_RE.test(id)) throw new Error('无效的插件 id')
  const dir = join(pluginDir(userId, id), 'storage')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function listPluginStorage(userId, id) {
  const dir = pluginStorageDir(userId, id)
  return readdirSync(dir)
    .filter((n) => !n.startsWith('.'))
    .map((name) => {
      const st = statSync(join(dir, name))
      return { name, size: st.size, mtime: st.mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

export function pluginStorageStats(userId, id) {
  const files = listPluginStorage(userId, id)
  return { count: files.length, bytes: files.reduce((s, f) => s + f.size, 0) }
}

export function savePluginStorageFile(userId, id, name, buffer) {
  writeFileSync(join(pluginStorageDir(userId, id), safeName(name)), buffer)
}

export function deletePluginStorageFile(userId, id, name) {
  rmSync(join(pluginStorageDir(userId, id), safeName(name)), { force: true })
}

export function deletePluginStorageBefore(userId, id, beforeMs) {
  const dir = pluginStorageDir(userId, id)
  let removed = 0
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).mtimeMs < beforeMs) {
      rmSync(p, { force: true })
      removed++
    }
  }
  return removed
}

export function pluginStoragePath(userId, id, name) {
  const p = join(pluginStorageDir(userId, id), safeName(name))
  return existsSync(p) ? p : null
}

function readManifest(dir) {
  const file = join(dir, 'plugin.json')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

const pluginMetaCache = new Map() // `${userId}:${id}` -> { dirMtime, rev, hasUi, hasJs }
const runtimeManifestCache = new Map() // `${userId}:${visitor}` -> { at, value }
const RUNTIME_MANIFEST_TTL = 2000

function invalidatePluginCache(userId, id) {
  const prefix = userId == null ? null : `${userId}:`
  for (const key of [...pluginMetaCache.keys()]) {
    if (!prefix || key.startsWith(prefix)) pluginMetaCache.delete(key)
  }
  for (const key of [...runtimeManifestCache.keys()]) {
    if (!prefix || key.startsWith(prefix)) runtimeManifestCache.delete(key)
  }
}

function pluginMeta(userId, id) {
  const dir = pluginDir(userId, id)
  let dirMtime = 0
  try {
    dirMtime = statSync(dir).mtimeMs
  } catch {
    return { rev: '0', hasUi: false, hasJs: false }
  }
  const key = `${userId}:${id}`
  const cached = pluginMetaCache.get(key)
  if (cached && cached.dirMtime === dirMtime) return cached

  let rev = '0'
  let hasUi = false
  let hasJs = false
  try {
    let max = 0
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (!f.isFile()) continue
      max = Math.max(max, statSync(join(dir, f.name)).mtimeMs)
      if (f.name === 'ui.ux') hasUi = true
      else if (f.name === 'ui.js') hasJs = true
    }
    rev = String(Math.round(max))
  } catch {
    /* defaults */
  }
  const meta = { dirMtime, rev, hasUi, hasJs }
  pluginMetaCache.set(key, meta)
  return meta
}

/* ------------------------------------------------------------------ */
/* listing / import / delete / state                                   */
/* ------------------------------------------------------------------ */

export function listPlugins(userId) {
  const states = getPluginStates(userId)
  const root = userPluginsRoot(userId)
  const ids = existsSync(root)
    ? readdirSync(root).filter((d) => existsSync(join(root, d, 'plugin.json')))
    : []
  return ids.map((id) => {
    const manifest = readManifest(pluginDir(userId, id)) || { id, name: id }
    const state = states[id] || {}
    const reg = runtime.get(`${userId}:${id}`)?.registrations
    const meta = pluginMeta(userId, id)
    return {
      id,
      owner: usernameOf(userId),
      name: manifest.name || id,
      version: manifest.version || '0.0.0',
      description: manifest.description || '',
      author: manifest.author || '',
      capabilities: manifest.capabilities || {},
      requestedPermissions: manifest.permissions || [],
      hasUi: meta.hasUi,
      hasJs: meta.hasJs,
      hasSources: existsSync(join(pluginDir(userId, id), 'sources')),
      hasApp: existsSync(join(pluginDir(userId, id), 'app.js')),
      rev: meta.rev,
      enabled: state.enabled === undefined ? false : Boolean(state.enabled),
      visitor: Boolean(state.visitor),
      locked: Boolean(state.locked),
      permissions: Array.isArray(state.permissions) ? state.permissions : [],
      token: (getUserSetting(userId, 'plugin_tokens', {}) || {})[id] || '',
      loaded: runtime.has(`${userId}:${id}`),
      error: state.error || null,
      widgets: reg?.widgets || [],
      pages: reg?.pages || [],
      postModules: reg?.postModules || [],
      editorTools: reg?.editorTools || [],
      overlays: reg?.overlays || [],
      topbars: reg?.topbars || [],
      footer: reg?.footer || [],
      cardSources: reg ? Object.keys(reg.cardSources).map((s) => ({ id: s })) : [],
    }
  })
}

/** Parse + validate a plugin ZIP without installing it. */
export function parsePluginPackage(buffer) {
  let zip
  try {
    zip = new AdmZip(buffer)
  } catch {
    throw new Error('无效的 zip 文件')
  }
  let rootPrefix = ''
  let entry = zip.getEntry('plugin.json')
  if (!entry) {
    const candidates = zip.getEntries().filter((e) => !e.isDirectory && /^[^/]+\/plugin\.json$/.test(e.entryName))
    if (candidates.length === 1) {
      entry = candidates[0]
      rootPrefix = candidates[0].entryName.replace(/plugin\.json$/, '')
    }
  }
  if (!entry) throw new Error('插件包缺少 plugin.json')

  let manifest
  try {
    manifest = JSON.parse(entry.getData().toString('utf-8'))
  } catch {
    throw new Error('plugin.json 解析失败')
  }
  const id = String(manifest.id || '').trim()
  if (!ID_RE.test(id)) throw new Error('plugin.json 的 id 无效（只允许小写字母、数字、连字符）')
  if (!manifest.name) throw new Error('plugin.json 缺少 name')
  return { zip, manifest, id, rootPrefix }
}

/** Read a plugin package's metadata for a pre-install confirmation dialog. */
export function inspectPlugin(buffer, ownerId = null) {
  const { manifest, id } = parsePluginPackage(buffer)
  const minSdkVersion = String(manifest.minSdkVersion || manifest.sdkVersion || '')
  const existing = ownerId != null ? listPlugins(ownerId).find((p) => p.id === id) : null
  return {
    id,
    name: manifest.name,
    version: manifest.version || '0.0.0',
    description: manifest.description || '',
    author: manifest.author || '',
    permissions: Array.isArray(manifest.permissions) ? manifest.permissions.map(String) : [],
    minSdkVersion,
    sdkVersion: SDK_VERSION,
    sdkOk: sdkSatisfies(minSdkVersion),
    // installing a package whose id already exists is an update
    update: Boolean(existing),
    existingVersion: existing ? existing.version : null,
  }
}

export function importPlugin(userId, buffer) {
  const { zip, manifest, id, rootPrefix } = parsePluginPackage(buffer)

  const minSdkVersion = String(manifest.minSdkVersion || manifest.sdkVersion || '')
  if (!sdkSatisfies(minSdkVersion)) {
    throw new Error(`该插件要求 SDK 版本 ≥ ${minSdkVersion}，当前站点 SDK 为 ${SDK_VERSION}，无法安装`)
  }

  const dir = pluginDir(userId, id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  invalidatePluginCache(userId, id)

  for (const item of zip.getEntries()) {
    if (item.isDirectory) continue
    let name = item.entryName.replace(/^\.?\//, '')
    if (rootPrefix && name.startsWith(rootPrefix)) name = name.slice(rootPrefix.length)
    if (!name || name.includes('..')) continue
    const target = join(dir, name)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, item.getData())
  }

  const states = getPluginStates(userId)
  if (!states[id]) {
    states[id] = { enabled: false, visitor: false, permissions: [] }
    setPluginStates(userId, states)
  }
  if (getPluginStates(userId)[id]?.enabled) loadPlugin(userId, id)
  return listPlugins(userId).find((p) => p.id === id)
}

export function deletePlugin(userId, id) {
  if (!ID_RE.test(id)) throw new Error('无效的插件 id')
  rmSync(pluginDir(userId, id), { recursive: true, force: true })
  runtime.delete(`${userId}:${id}`)
  invalidatePluginCache(userId, id)
  const states = getPluginStates(userId)
  delete states[id]
  setPluginStates(userId, states)
}

export function updatePluginState(userId, id, patch) {
  const states = getPluginStates(userId)
  const current = states[id] || { enabled: false, visitor: false, permissions: [] }
  const next = { ...current }
  if (patch.enabled !== undefined) next.enabled = Boolean(patch.enabled)
  if (patch.visitor !== undefined) next.visitor = Boolean(patch.visitor)
  if (patch.locked !== undefined) next.locked = Boolean(patch.locked)
  if (patch.permissions !== undefined && Array.isArray(patch.permissions)) {
    next.permissions = [...new Set(patch.permissions.map(String))]
  }
  states[id] = next
  setPluginStates(userId, states)

  if (patch.token !== undefined) {
    const tokens = getUserSetting(userId, 'plugin_tokens', {}) || {}
    tokens[id] = String(patch.token)
    setUserSetting(userId, 'plugin_tokens', tokens)
  }
  if (next.enabled) loadPlugin(userId, id)
  else runtime.delete(`${userId}:${id}`)
  return listPlugins(userId).find((p) => p.id === id)
}

/* ------------------------------------------------------------------ */
/* sandbox (scoped to the owning user)                                 */
/* ------------------------------------------------------------------ */

/** Only http(s) to *public* hosts — blocks SSRF to loopback / private networks /
 *  cloud metadata endpoints. */
export function assertPublicHttpUrl(url) {
  let u
  try {
    u = new URL(String(url || ''))
  } catch {
    throw new Error('无效的 URL')
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error('仅允许 http(s) URL')
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('不允许访问内网地址')
  }
  if (/^(127|0|10)\./.test(host) || /^(?:\d+\.)?169\.254\./.test(host)) {
    throw new Error('不允许访问内网地址')
  }
  if (/^192\.168\./.test(host)) throw new Error('不允许访问内网地址')
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) throw new Error('不允许访问内网地址')
  if (host === '::1' || host.startsWith('::ffff:127.') || host.startsWith('fd') || host.startsWith('fe80')) {
    throw new Error('不允许访问内网地址')
  }
  return u
}

function buildSandbox(userId, pluginId, manifest, dir, registrations) {
  const permissions = getPluginStates(userId)[pluginId]?.permissions || []
  const api = {
    id: pluginId,
    manifest,
    log: (...args) => console.log(`[plugin:${userId}:${pluginId}]`, ...args),
    permissions,
    hasPermission: (p) => permissions.includes(p),

    registerRoute(name, handler) {
      if (typeof handler === 'function') registrations.routes[name] = handler
    },
    registerCardSource(id, handler) {
      if (typeof handler === 'function') registrations.cardSources[id] = handler
    },
    registerPage(def) {
      registrations.pages.push({ id: String(def.id || 'index'), title: def.title || manifest.name, icon: def.icon || 'extension' })
    },
    registerSettings(def) {
      registrations.settings.push({
        id: String(def.id || 'settings'),
        title: def.title || manifest.name,
        icon: def.icon || 'settings',
        adminOnly: def.adminOnly === true,
      })
    },
    registerWidget(def) {
      registrations.widgets.push({ id: String(def.id || 'main'), title: def.title || manifest.name })
    },
    registerOverlay(def = {}) {
      registrations.overlays.push({ id: String(def.id || 'main'), pages: def.pages || ['*'] })
    },
    registerTopbar(def = {}) {
      registrations.topbars.push({ id: String(def.id || 'main'), title: def.title || manifest.name })
    },
    registerFooter(def = {}) {
      registrations.footer.push({ id: String(def.id || 'main'), title: def.title || manifest.name })
    },
    registerPostModule(def) {
      registrations.postModules.push({ id: String(def.id || 'main'), title: def.title || manifest.name })
    },
    registerEditorTool(def) {
      registrations.editorTools.push({
        id: String(def.id || 'main'),
        label: def.label || manifest.name,
        icon: def.icon || 'extension',
        ui: def.ui === true,
      })
    },
  }

  // content is scoped to the owning user
  if (permissions.includes('posts:read')) {
    api.getPosts = (opts = {}) =>
      db
        .prepare(
          `SELECT id, title, slug, summary, category, tags, created_at FROM posts
           WHERE author_id = ? ${opts.all ? '' : "AND status = 'published'"} ORDER BY datetime(created_at) DESC LIMIT ?`
        )
        .all(userId, Math.min(Number(opts.limit) || 20, 100))
        .map((p) => ({ ...p, tags: JSON.parse(p.tags || '[]') }))
  }
  if (permissions.includes('moments:read')) {
    api.getMoments = (opts = {}) =>
      db
        .prepare('SELECT id, content, images, created_at FROM moments WHERE author_id = ? ORDER BY datetime(created_at) DESC LIMIT ?')
        .all(userId, Math.min(Number(opts.limit) || 20, 100))
        .map((m) => ({ ...m, images: JSON.parse(m.images || '[]') }))
  }
  if (permissions.includes('settings:read')) {
    api.getSiteSettings = () => getSetting('site', {})
    api.getProfile = () => {
      const u = db
        .prepare('SELECT display_name, username, avatar, bio FROM users WHERE id = ?')
        .get(userId)
      return u || null
    }
  }
  if (permissions.includes('net:fetch')) {
    api.fetch = (url, options = {}) => {
      try {
        assertPublicHttpUrl(url)
      } catch (err) {
        return Promise.reject(err)
      }
      return fetch(String(url), { ...options, signal: AbortSignal.timeout(10000) })
    }
  }
  if (permissions.includes('token')) {
    api.token = (getUserSetting(userId, 'plugin_tokens', {}) || {})[pluginId] || ''
  }
  if (permissions.includes('storage')) {
    api.storage = storageApiFor(userId, pluginId)
    api.shared = sharedApiFor(pluginId)
  }
  return { plugin: api, console: { log: api.log, error: api.log, warn: api.log } }
}

/** Site-wide (shared across all users/visitors) JSON store for a plugin:
 *  `DATA_DIR/plugin-data/<pluginId>/`. Used by plugins whose data is global,
 *  e.g. interactive forms where any visitor submits to the form's owner. */
function sharedApiFor(pluginId) {
  const dir = join(DATA_DIR, 'plugin-data', pluginId)
  mkdirSync(dir, { recursive: true })
  const list = () =>
    readdirSync(dir)
      .filter((n) => !n.startsWith('.'))
      .map((name) => {
        const st = statSync(join(dir, name))
        return { name, size: st.size, mtime: st.mtimeMs }
      })
  return {
    list,
    read: (name) => readFileSync(join(dir, safeName(name)), 'utf-8'),
    write: (name, data) => {
      writeFileSync(join(dir, safeName(name)), data)
      return true
    },
    remove: (name) => {
      rmSync(join(dir, safeName(name)), { force: true })
      return true
    },
    readJSON: (name, fallback = null) => {
      try {
        return JSON.parse(readFileSync(join(dir, safeName(name)), 'utf-8'))
      } catch {
        return fallback
      }
    },
    writeJSON: (name, obj) => {
      writeFileSync(join(dir, safeName(name)), JSON.stringify(obj, null, 2))
      return true
    },
  }
}

/** The storage API bound to a specific user + plugin (also used by admin cross-user reads). */
function storageApiFor(userId, pluginId) {
  const dir = pluginStorageDir(userId, pluginId)
  return {
    list: () => listPluginStorage(userId, pluginId),
    stats: () => pluginStorageStats(userId, pluginId),
    read: (name) => readFileSync(join(dir, safeName(name)), 'utf-8'),
    write: (name, data) => {
      writeFileSync(join(dir, safeName(name)), data)
      return true
    },
    remove: (name) => {
      rmSync(join(dir, safeName(name)), { force: true })
      return true
    },
    readJSON: (name, fallback = null) => {
      try {
        return JSON.parse(readFileSync(join(dir, safeName(name)), 'utf-8'))
      } catch {
        return fallback
      }
    },
    writeJSON: (name, obj) => {
      writeFileSync(join(dir, safeName(name)), JSON.stringify(obj, null, 2))
      return true
    },
    url: (name) => `/api/plugins/${pluginId}/storage/${encodeURIComponent(safeName(name))}?username=${encodeURIComponent(usernameOf(userId))}`,
  }
}

function loadPlugin(userId, id) {
  runtime.delete(`${userId}:${id}`)
  const dir = pluginDir(userId, id)
  const manifest = readManifest(dir)
  if (!manifest) return markError(userId, id, 'plugin.json 缺失')
  const minSdkVersion = String(manifest.minSdkVersion || manifest.sdkVersion || '')
  if (!sdkSatisfies(minSdkVersion)) {
    return markError(userId, id, `需要 SDK ≥ ${minSdkVersion}，当前站点 SDK 为 ${SDK_VERSION}`)
  }
  const appPath = join(dir, 'app.js')
  if (!existsSync(appPath)) return markError(userId, id, 'app.js 缺失')

  const registrations = { routes: {}, cardSources: {}, pages: [], widgets: [], overlays: [], topbars: [], footer: [], postModules: [], editorTools: [], settings: [] }
  try {
    const sandbox = buildSandbox(userId, id, manifest, dir, registrations)
    const context = vm.createContext(sandbox)
    const code = readFileSync(appPath, 'utf-8')
    vm.runInContext(code, context, { filename: `plugin:${userId}/${id}/app.js`, timeout: SCRIPT_TIMEOUT })
    runtime.set(`${userId}:${id}`, { manifest, dir, registrations, userId })
    clearError(userId, id)
  } catch (err) {
    markError(userId, id, String(err?.message || err))
  }
}

function markError(userId, id, message) {
  const states = getPluginStates(userId)
  states[id] = { ...(states[id] || {}), error: message }
  setPluginStates(userId, states)
  runtime.delete(`${userId}:${id}`)
}
function clearError(userId, id) {
  const states = getPluginStates(userId)
  if (states[id]?.error) {
    delete states[id].error
    setPluginStates(userId, states)
  }
}

/** One-time: move pre-multi-user global plugins + state into the admin's user dir. */
function migrateLegacyPlugins() {
  const admin = primaryUserId()
  if (admin == null) return
  const root = userPluginsRoot(admin)
  const adminHas = existsSync(root) && readdirSync(root).some((d) => existsSync(join(root, d, 'plugin.json')))
  if (!adminHas && existsSync(PLUGINS_DIR)) {
    mkdirSync(root, { recursive: true })
    for (const d of readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
      if (!d.isDirectory() || !existsSync(join(PLUGINS_DIR, d.name, 'plugin.json'))) continue
      try {
        cpSync(join(PLUGINS_DIR, d.name), join(root, d.name), { recursive: true })
      } catch {
        /* ignore */
      }
    }
  }
  // state / tokens are migrated independently (copy-if-absent) so they aren't
  // lost if the plugin code was already moved on an earlier boot
  if (getUserSetting(admin, 'plugins', null) == null) {
    const states = getSetting('plugins', {})
    if (states && Object.keys(states).length) setUserSetting(admin, 'plugins', states)
  }
  if (getUserSetting(admin, 'plugin_tokens', null) == null) {
    const tokens = getSetting('plugin_tokens', {})
    if (tokens && Object.keys(tokens).length) setUserSetting(admin, 'plugin_tokens', tokens)
  }
}

/** One-time: move pre-multi-user plugin STORAGE into the admin's per-user storage. */
function migrateLegacyPluginStorage() {
  const admin = primaryUserId()
  const legacy = join(DATA_DIR, 'plugins')
  if (admin == null || !existsSync(legacy)) return
  for (const d of readdirSync(legacy, { withFileTypes: true })) {
    if (!d.isDirectory() || !ID_RE.test(d.name)) continue
    const srcRoot = join(legacy, d.name)
    let dstRoot
    try {
      dstRoot = pluginStorageDir(admin, d.name)
    } catch {
      continue
    }
    for (const f of readdirSync(srcRoot, { withFileTypes: true })) {
      if (!f.isFile()) continue
      const target = join(dstRoot, f.name)
      if (existsSync(target)) continue
      try {
        cpSync(join(srcRoot, f.name), target)
      } catch {
        /* ignore */
      }
    }
  }
}

export function loadAllPlugins() {
  migrateLegacyPlugins()
  migrateLegacyPluginStorage()
  for (const u of db.prepare('SELECT id FROM users').all()) {
    const states = getPluginStates(u.id)
    for (const [id, state] of Object.entries(states)) {
      if (state.enabled && existsSync(pluginDir(u.id, id))) loadPlugin(u.id, id)
    }
  }
}

/* ------------------------------------------------------------------ */
/* runtime access                                                      */
/* ------------------------------------------------------------------ */

export function getRuntimeManifest(canSeePrivate, userId) {
  const key = `${userId}:${canSeePrivate ? 1 : 0}`
  const now = Date.now()
  const cached = runtimeManifestCache.get(key)
  if (cached && now - cached.at < RUNTIME_MANIFEST_TTL) return cached.value

  const states = getPluginStates(userId)
  const owner = usernameOf(userId)
  const plugins = []
  for (const [rk, entry] of runtime.entries()) {
    if (entry.userId !== userId) continue
    const id = rk.slice(`${userId}:`.length)
    const state = states[id] || {}
    if (!state.enabled) continue
    // a plugin only runs in the owner's own session unless it is published to visitors
    if (!canSeePrivate && !state.visitor) continue
    const { manifest, registrations } = entry
    const meta = pluginMeta(userId, id)
    plugins.push({
      id,
      owner,
      name: manifest.name || id,
      version: manifest.version || '0.0.0',
      rev: meta.rev,
      hasUi: meta.hasUi,
      hasJs: meta.hasJs,
      assetBase: `/api/plugins/${id}/asset`,
      capabilities: manifest.capabilities || {},
      pages: registrations.pages,
      settings: registrations.settings,
      widgets: registrations.widgets,
      overlays: registrations.overlays,
      topbars: registrations.topbars,
      footer: registrations.footer,
      postModules: registrations.postModules,
      editorTools: registrations.editorTools,
      cardSources: Object.keys(registrations.cardSources).map((s) => ({ id: s })),
    })
  }
  runtimeManifestCache.set(key, { at: now, value: plugins })
  return plugins
}

export function hasCardSource(userId, id, source) {
  return Boolean(runtime.get(`${userId}:${id}`)?.registrations.cardSources[source])
}

export async function getCardData(userId, id, source, params = {}) {
  const handler = runtime.get(`${userId}:${id}`)?.registrations.cardSources[source]
  if (!handler) throw new Error('数据源不存在')
  return await handler(params)
}

export async function callRoute(userId, id, name, req) {
  const handler = runtime.get(`${userId}:${id}`)?.registrations.routes[name]
  if (!handler) throw new Error('接口不存在')
  return await handler(req)
}

export function getPluginUi(userId, id) {
  const file = join(pluginDir(userId, id), 'ui.ux')
  if (!existsSync(file)) return null
  return sanitizeTemplate(readFileSync(file, 'utf-8'))
}

/** Mirror of the client-side template filter: strip scripts, event handlers and
 *  javascript: URLs — used for the plugin's `ui.ux` before it reaches the browser. */
export function sanitizeTemplate(html) {
  let out = String(html || '')
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
  out = out.replace(/<script\b[^>]*\/?>/gi, '')
  // event handlers with single, double or bare quotes
  out = out.replace(/\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g, '')
  // javascript: URLs in href / src / action / formaction etc.
  out = out.replace(
    /(\s(?:href|src|action|formaction|xlink:href)\s*=\s*)(["'])\s*javascript:[^"']*\2/gi,
    '$1$2#$2'
  )
  return out
}

export function pluginAssetPath(userId, id, relPath) {
  const clean = String(relPath || '').replace(/^\/+/, '')
  if (!clean || clean.includes('..')) return null
  const p = join(pluginDir(userId, id), clean)
  return existsSync(p) ? p : null
}
