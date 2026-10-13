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
} from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSetting, setSetting, db, DATA_DIR } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const PLUGINS_DIR = process.env.HOMEPAGE_PLUGINS_DIR || join(__dirname, '..', 'plugins')
export const PLUGIN_DATA_DIR = join(DATA_DIR, 'plugins')

mkdirSync(PLUGINS_DIR, { recursive: true })
mkdirSync(PLUGIN_DATA_DIR, { recursive: true })

const ID_RE = /^[a-z0-9][a-z0-9-]*$/
const STATE_KEY = 'plugins'
const SCRIPT_TIMEOUT = 1500

// in-memory runtime registry: id -> { manifest, dir, registrations }
const runtime = new Map()

export function pluginDir(id) {
  return join(PLUGINS_DIR, id)
}

/* ------------------------------------------------------------------ */
/* plugin storage (generic, reusable)                                  */
/* ------------------------------------------------------------------ */

function safeName(name) {
  const n = basename(String(name || ''))
  if (!n || n === '.' || n === '..' || n.includes('/') || n.includes('\\')) {
    throw new Error('无效的文件名')
  }
  return n
}

export function pluginStorageDir(id) {
  if (!ID_RE.test(id)) throw new Error('无效的插件 id')
  const dir = join(PLUGIN_DATA_DIR, id)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function listPluginStorage(id) {
  const dir = pluginStorageDir(id)
  return readdirSync(dir)
    .filter((n) => !n.startsWith('.'))
    .map((name) => {
      const st = statSync(join(dir, name))
      return { name, size: st.size, mtime: st.mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

export function pluginStorageStats(id) {
  const files = listPluginStorage(id)
  return { count: files.length, bytes: files.reduce((s, f) => s + f.size, 0) }
}

export function savePluginStorageFile(id, name, buffer) {
  writeFileSync(join(pluginStorageDir(id), safeName(name)), buffer)
}

export function deletePluginStorageFile(id, name) {
  rmSync(join(pluginStorageDir(id), safeName(name)), { force: true })
}

export function deletePluginStorageBefore(id, beforeMs) {
  const dir = pluginStorageDir(id)
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

export function pluginStoragePath(id, name) {
  const p = join(pluginStorageDir(id), safeName(name))
  return existsSync(p) ? p : null
}

function readManifest(id) {
  const file = join(pluginDir(id), 'plugin.json')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

/** A revision token derived from the newest file mtime — used to bust client caches after re-import. */
function pluginRevision(id) {
  try {
    const dir = pluginDir(id)
    let max = 0
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.isFile()) max = Math.max(max, statSync(join(dir, f.name)).mtimeMs)
    }
    return String(Math.round(max))
  } catch {
    return '0'
  }
}

export function getPluginStates() {
  return getSetting(STATE_KEY, {}) || {}
}

function setPluginStates(states) {
  setSetting(STATE_KEY, states)
}

export function listPlugins() {
  const states = getPluginStates()
  const ids = existsSync(PLUGINS_DIR)
    ? readdirSync(PLUGINS_DIR).filter((d) => existsSync(join(PLUGINS_DIR, d, 'plugin.json')))
    : []
  return ids.map((id) => {
    const manifest = readManifest(id) || { id, name: id }
    const state = states[id] || {}
    const dir = pluginDir(id)
    const reg = runtime.get(id)?.registrations
    return {
      id,
      name: manifest.name || id,
      version: manifest.version || '0.0.0',
      description: manifest.description || '',
      author: manifest.author || '',
      capabilities: manifest.capabilities || {},
      requestedPermissions: manifest.permissions || [],
      hasUi: existsSync(join(dir, 'ui.ux')),
      hasJs: existsSync(join(dir, 'ui.js')),
      hasSources: existsSync(join(dir, 'sources')),
      hasApp: existsSync(join(dir, 'app.js')),
      rev: pluginRevision(id),
      enabled: state.enabled !== false && state.enabled !== undefined ? state.enabled : false,
      visitor: Boolean(state.visitor),
      permissions: Array.isArray(state.permissions) ? state.permissions : [],
      token: (getSetting('plugin_tokens', {}) || {})[id] || '',
      loaded: runtime.has(id),
      error: state.error || null,
      // contributions (available once loaded)
      widgets: reg?.widgets || [],
      pages: reg?.pages || [],
      postModules: reg?.postModules || [],
      editorTools: reg?.editorTools || [],
      cardSources: reg ? Object.keys(reg.cardSources).map((s) => ({ id: s })) : [],
    }
  })
}

export function importPlugin(buffer) {
  let zip
  try {
    zip = new AdmZip(buffer)
  } catch {
    throw new Error('无效的 zip 文件')
  }

  // Accept either plugin.json at the root, or inside a single top-level folder.
  let rootPrefix = ''
  let entry = zip.getEntry('plugin.json')
  if (!entry) {
    const candidates = zip
      .getEntries()
      .filter((e) => !e.isDirectory && /^[^/]+\/plugin\.json$/.test(e.entryName))
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

  const dir = pluginDir(id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  for (const item of zip.getEntries()) {
    if (item.isDirectory) continue
    let name = item.entryName.replace(/^\.?\//, '')
    if (rootPrefix && name.startsWith(rootPrefix)) name = name.slice(rootPrefix.length)
    if (!name || name.includes('..')) continue
    const target = join(dir, name)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, item.getData())
  }

  const states = getPluginStates()
  if (!states[id]) {
    states[id] = { enabled: false, visitor: false, permissions: [] }
    setPluginStates(states)
  }

  // If the plugin is already enabled, reload it so the new code takes effect immediately.
  if (getPluginStates()[id]?.enabled) loadPlugin(id)

  return listPlugins().find((p) => p.id === id)
}

export function deletePlugin(id) {
  if (!ID_RE.test(id)) throw new Error('无效的插件 id')
  rmSync(pluginDir(id), { recursive: true, force: true })
  runtime.delete(id)
  const states = getPluginStates()
  delete states[id]
  setPluginStates(states)
}

export function updatePluginState(id, patch) {
  const states = getPluginStates()
  const current = states[id] || { enabled: false, visitor: false, permissions: [] }
  const next = { ...current }
  if (patch.enabled !== undefined) next.enabled = Boolean(patch.enabled)
  if (patch.visitor !== undefined) next.visitor = Boolean(patch.visitor)
  if (patch.permissions !== undefined && Array.isArray(patch.permissions)) {
    next.permissions = [...new Set(patch.permissions.map(String))]
  }
  states[id] = next
  setPluginStates(states)

  if (patch.token !== undefined) {
    const tokens = getSetting('plugin_tokens', {}) || {}
    tokens[id] = String(patch.token)
    setSetting('plugin_tokens', tokens)
  }

  if (next.enabled) loadPlugin(id)
  else runtime.delete(id)

  return listPlugins().find((p) => p.id === id)
}

/* ------------------------------------------------------------------ */
/* sandbox                                                             */
/* ------------------------------------------------------------------ */

function hasPermission(id, perm) {
  const states = getPluginStates()
  const perms = states[id]?.permissions || []
  return perms.includes(perm)
}

function buildSandbox(plugin, manifest, dir, registrations) {
  const permissions = getPluginStates()[plugin]?.permissions || []
  const api = {
    id: plugin,
    manifest,
    log: (...args) => console.log(`[plugin:${plugin}]`, ...args),
    permissions,
    hasPermission: (p) => permissions.includes(p),

    registerRoute(name, handler) {
      if (typeof handler === 'function') registrations.routes[name] = handler
    },
    registerCardSource(id, handler) {
      if (typeof handler === 'function') registrations.cardSources[id] = handler
    },
    registerPage(def) {
      registrations.pages.push({
        id: String(def.id || 'index'),
        title: def.title || manifest.name,
        icon: def.icon || 'extension',
      })
    },
    registerWidget(def) {
      registrations.widgets.push({ id: String(def.id || 'main'), title: def.title || manifest.name })
    },
    registerOverlay(def = {}) {
      registrations.overlays.push({ id: String(def.id || 'main'), pages: def.pages || ['*'] })
    },
    registerPostModule(def) {
      registrations.postModules.push({ id: String(def.id || 'main'), title: def.title || manifest.name })
    },
    registerEditorTool(def) {
      registrations.editorTools.push({
        id: String(def.id || 'tool'),
        label: def.label || manifest.name,
        icon: def.icon || 'extension',
      })
    },
  }

  if (permissions.includes('posts:read')) {
    api.getPosts = (opts = {}) =>
      db
        .prepare(
          `SELECT id, title, slug, summary, category, tags, created_at FROM posts
           ${opts.all ? '' : "WHERE status = 'published'"} ORDER BY datetime(created_at) DESC LIMIT ?`
        )
        .all(Math.min(Number(opts.limit) || 20, 100))
        .map((p) => ({ ...p, tags: JSON.parse(p.tags || '[]') }))
  }
  if (permissions.includes('moments:read')) {
    api.getMoments = (opts = {}) =>
      db
        .prepare('SELECT id, content, images, created_at FROM moments ORDER BY datetime(created_at) DESC LIMIT ?')
        .all(Math.min(Number(opts.limit) || 20, 100))
        .map((m) => ({ ...m, images: JSON.parse(m.images || '[]') }))
  }
  if (permissions.includes('settings:read')) {
    api.getSiteSettings = () => getSetting('site', {})
    api.getProfile = () => {
      const u = db.prepare('SELECT display_name, username, avatar, bio FROM users ORDER BY id LIMIT 1').get()
      return u || null
    }
  }
  if (permissions.includes('net:fetch')) {
    api.fetch = (url, options = {}) => {
      const u = String(url || '')
      if (!/^https?:\/\//i.test(u)) return Promise.reject(new Error('only http(s) URLs allowed'))
      return fetch(u, { ...options, signal: AbortSignal.timeout(10000) })
    }
  }
  if (permissions.includes('token')) {
    api.token = getSetting('plugin_tokens', {})[plugin] || ''
  }

  if (permissions.includes('storage')) {
    const dir = pluginStorageDir(plugin)
    api.storage = {
      list: () => listPluginStorage(plugin),
      stats: () => pluginStorageStats(plugin),
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
      url: (name) => `/api/plugins/${plugin}/storage/${encodeURIComponent(safeName(name))}`,
    }
  }

  return { plugin: api, console: { log: api.log, error: api.log, warn: api.log } }
}

function loadPlugin(id) {
  runtime.delete(id)
  const manifest = readManifest(id)
  if (!manifest) {
    markError(id, 'plugin.json 缺失')
    return
  }
  const appPath = join(pluginDir(id), 'app.js')
  if (!existsSync(appPath)) {
    markError(id, 'app.js 缺失')
    return
  }

  const registrations = {
    routes: {},
    cardSources: {},
    pages: [],
    widgets: [],
    overlays: [],
    postModules: [],
    editorTools: [],
  }

  try {
    const sandbox = buildSandbox(id, manifest, pluginDir(id), registrations)
    const context = vm.createContext(sandbox)
    const code = readFileSync(appPath, 'utf-8')
    vm.runInContext(code, context, { filename: `plugin:${id}/app.js`, timeout: SCRIPT_TIMEOUT })
    runtime.set(id, { manifest, dir: pluginDir(id), registrations })
    clearError(id)
  } catch (err) {
    markError(id, String(err?.message || err))
  }
}

function markError(id, message) {
  const states = getPluginStates()
  states[id] = { ...(states[id] || {}), error: message }
  setPluginStates(states)
  runtime.delete(id)
}

function clearError(id) {
  const states = getPluginStates()
  if (states[id]?.error) {
    delete states[id].error
    setPluginStates(states)
  }
}

export function loadAllPlugins() {
  const states = getPluginStates()
  for (const [id, state] of Object.entries(states)) {
    if (state.enabled && existsSync(pluginDir(id))) loadPlugin(id)
  }
}

/* ------------------------------------------------------------------ */
/* runtime access                                                      */
/* ------------------------------------------------------------------ */

export function getRuntimeManifest(forVisitor) {
  const states = getPluginStates()
  const plugins = []
  for (const [id, entry] of runtime.entries()) {
    const state = states[id] || {}
    if (!state.enabled) continue
    if (forVisitor && !state.visitor) continue
    const { manifest, registrations } = entry
    plugins.push({
      id,
      name: manifest.name || id,
      version: manifest.version || '0.0.0',
      rev: pluginRevision(id),
      hasUi: existsSync(join(entry.dir, 'ui.ux')),
      hasJs: existsSync(join(entry.dir, 'ui.js')),
      assetBase: `/plugins/${id}`,
      capabilities: manifest.capabilities || {},
      pages: registrations.pages,
      widgets: registrations.widgets,
      overlays: registrations.overlays,
      postModules: registrations.postModules,
      editorTools: registrations.editorTools,
      cardSources: Object.keys(registrations.cardSources).map((s) => ({ id: s })),
    })
  }
  return plugins
}

export function hasCardSource(id, source) {
  return Boolean(runtime.get(id)?.registrations.cardSources[source])
}

export async function getCardData(id, source, params = {}) {
  const entry = runtime.get(id)
  const handler = entry?.registrations.cardSources[source]
  if (!handler) throw new Error('数据源不存在')
  return await handler(params)
}

export async function callRoute(id, name, req) {
  const entry = runtime.get(id)
  const handler = entry?.registrations.routes[name]
  if (!handler) throw new Error('接口不存在')
  return await handler(req)
}

export function getPluginUi(id) {
  const file = join(pluginDir(id), 'ui.ux')
  if (!existsSync(file)) return null
  return readFileSync(file, 'utf-8')
}
