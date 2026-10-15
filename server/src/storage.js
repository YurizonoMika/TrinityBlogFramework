// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { statfsSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR, UPLOAD_DIR, db, getSetting, primaryUserId } from './db.js'
import { listPlugins, pluginStorageDir, listPluginStorage, pluginDir } from './plugins.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = join(__dirname, '..')
const APP_DIR = join(SERVER_DIR, '..')
const WEB_DIST = join(APP_DIR, 'web', 'dist')
const NODE_MODULES = join(APP_DIR, 'node_modules')
const DB_FILE = join(DATA_DIR, 'homepage.db')
const USER_DIR = join(DATA_DIR, 'users') // per-user data (plugin code + storage)

function diskUsage(path) {
  try {
    const s = statfsSync(path)
    const total = Number(s.blocks) * Number(s.bsize)
    const free = Number(s.bavail) * Number(s.bsize)
    return { total, free, used: Math.max(0, total - free) }
  } catch {
    return { total: 0, free: 0, used: 0 }
  }
}

function dirSize(dir, skip) {
  if (!existsSync(dir)) return 0
  let total = 0
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const p = join(current, entry.name)
      if (skip && p === skip) continue
      try {
        if (entry.isDirectory()) stack.push(p)
        else if (entry.isFile()) total += statSync(p).size
      } catch {
        /* ignore */
      }
    }
  }
  return total
}

function fileSize(p) {
  try {
    return statSync(p).size
  } catch {
    return 0
  }
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Relative path (from `/uploads/`) of a `/uploads/...` reference. */
function uploadRefPath(ref) {
  const m = String(ref || '').match(/\/uploads\/([^"')\s>?#]+)/)
  if (!m) return null
  let p = m[1]
  try {
    p = decodeURIComponent(p)
  } catch {
    /* keep raw */
  }
  return p.replace(/^\.\//, '')
}

function scanUploadNames(text, out) {
  const re = /\/uploads\/[^"')\s>?#]+/g
  let m
  while ((m = re.exec(String(text || '')))) {
    const p = uploadRefPath(m[0])
    if (p) out.add(p)
  }
}

function collectReferences() {
  const posts = new Set()
  const moments = new Set()
  const site = new Set()

  for (const row of db.prepare('SELECT cover, content FROM posts').all()) {
    const n = uploadRefPath(row.cover)
    if (n) posts.add(n)
    scanUploadNames(row.content, posts)
  }
  for (const row of db.prepare('SELECT content, images FROM moments').all()) {
    for (const url of safeJsonArray(row.images)) {
      const n = uploadRefPath(url)
      if (n) moments.add(n)
    }
    scanUploadNames(row.content, moments)
  }
  const siteSettings = getSetting('site', {}) || {}
  for (const key of ['icon', 'banner']) {
    const n = uploadRefPath(siteSettings[key])
    if (n) site.add(n)
  }
  for (const row of db.prepare('SELECT avatar FROM users').all()) {
    const n = uploadRefPath(row.avatar)
    if (n) site.add(n)
  }
  return { posts, moments, site }
}

function listUploadFiles() {
  const out = []
  const walk = (dir, prefix) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const p = join(dir, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(p, rel)
      else if (entry.isFile()) out.push({ path: rel, size: fileSize(p) })
    }
  }
  walk(UPLOAD_DIR, '')
  return out
}

function sumByPath(files, names) {
  let bytes = 0
  let count = 0
  for (const f of files) {
    if (names.has(f.path)) {
      bytes += f.size
      count++
    }
  }
  return { bytes, count }
}

/** Per-user plugin disk usage (code + storage), and the full plugin list
 *  (every installed plugin, even with zero stored files). */
function pluginUsage(usersRows) {
  const per = new Map()
  const list = []
  for (const u of usersRows) {
    for (const p of listPlugins(u.id)) {
      const files = listPluginStorage(u.id, p.id)
      const bytes = dirSize(pluginDir(u.id, p.id))
      list.push({ id: p.id, name: p.name, owner: u.username, bytes, files: files.length, enabled: p.enabled })
      per.set(u.id, (per.get(u.id) || 0) + bytes)
    }
  }
  list.sort((a, b) => b.bytes - a.bytes)
  return { per, list }
}

export function getStorageOverview(opts = {}) {
  const { userId = null, isAdmin = true } = opts
  const refs = collectReferences()
  const uploads = listUploadFiles()

  const posts = sumByPath(uploads, refs.posts)
  const moments = sumByPath(uploads, refs.moments)
  const contentRefs = new Set([...refs.posts, ...refs.moments])
  let systemUploadBytes = 0
  let orphanBytes = 0
  let orphanCount = 0
  let totalUploadBytes = 0
  for (const f of uploads) {
    totalUploadBytes += f.size
    if (contentRefs.has(f.path)) continue
    systemUploadBytes += f.size
    if (!refs.site.has(f.path)) {
      orphanBytes += f.size
      orphanCount++
    }
  }

  const dbBytes = fileSize(DB_FILE) + fileSize(DB_FILE + '-wal') + fileSize(DB_FILE + '-shm')

  const usersRows = db.prepare('SELECT id, username, display_name, role FROM users ORDER BY id ASC').all()
  const { per: pluginByUser, list: plugins } = pluginUsage(usersRows)

  const pluginsDataBytes = dirSize(USER_DIR)
  const configBytes = Math.max(0, dirSize(DATA_DIR, USER_DIR) - dbBytes)

  const parts = [
    { id: 'database', label: '数据库', bytes: dbBytes },
    { id: 'uploads', label: '上传文件', bytes: totalUploadBytes },
    { id: 'user-data', label: '用户数据与插件', bytes: pluginsDataBytes },
    { id: 'dist', label: '前端构建', bytes: dirSize(WEB_DIST) },
    { id: 'server', label: '服务端代码', bytes: dirSize(SERVER_DIR, join(SERVER_DIR, 'node_modules')) },
    { id: 'deps', label: '依赖 (node_modules)', bytes: dirSize(NODE_MODULES) },
  ]
  const siteBytes = parts.reduce((s, p) => s + p.bytes, 0)

  // per-user attribution: uploads under `users/<id>/...` (+ legacy flat -> owner) and plugin data
  const ownerId = primaryUserId()
  const perUser = new Map()
  for (const f of uploads) {
    const m = f.path.match(/^users\/(\d+)\//)
    const owner = m ? Number(m[1]) : ownerId
    perUser.set(owner, (perUser.get(owner) || 0) + f.size)
  }
  for (const [id, bytes] of pluginByUser) perUser.set(id, (perUser.get(id) || 0) + bytes)
  const users = usersRows.map((u) => ({ id: u.id, username: u.username, name: u.display_name || u.username, role: u.role, bytes: perUser.get(u.id) || 0 }))

  const base = {
    disk: diskUsage(APP_DIR),
    site: { bytes: siteBytes, parts },
    uploads: { total: totalUploadBytes, referenced: totalUploadBytes - systemUploadBytes, orphan: orphanBytes, orphanCount },
  }

  if (!isAdmin) {
    const own = users.find((u) => u.id === userId)
    const others = users.filter((u) => u.id !== userId).reduce((s, u) => s + u.bytes, 0)
    return {
      ...base,
      limited: true,
      own: own ? { id: own.id, name: own.name, bytes: own.bytes } : { id: userId, name: '', bytes: 0 },
      others,
      users: [],
      categories: null,
    }
  }

  return {
    ...base,
    limited: false,
    users,
    categories: {
      posts: { bytes: posts.bytes, files: posts.count },
      moments: { bytes: moments.bytes, files: moments.count },
      system: { bytes: dbBytes + configBytes + systemUploadBytes, detail: { database: dbBytes, config: configBytes, uploads: systemUploadBytes } },
      plugins,
    },
  }
}

export function cleanOrphanUploads() {
  const refs = collectReferences()
  const referenced = new Set([...refs.posts, ...refs.moments, ...refs.site])
  let removed = 0
  let bytes = 0
  for (const f of listUploadFiles()) {
    if (referenced.has(f.path)) continue
    try {
      rmSync(join(UPLOAD_DIR, f.path), { force: true })
      removed++
      bytes += f.size
    } catch {
      /* ignore */
    }
  }
  return { removed, bytes }
}

export function clearPluginStorage(userId, id) {
  const dir = pluginStorageDir(userId, id)
  let removed = 0
  let bytes = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    try {
      const size = entry.isDirectory() ? dirSize(p) : statSync(p).size
      rmSync(p, { recursive: true, force: true })
      removed++
      bytes += size
    } catch {
      /* ignore */
    }
  }
  return { removed, bytes }
}

export function vacuumDatabase() {
  const before = fileSize(DB_FILE)
  try {
    db.exec('VACUUM')
  } catch {
    /* ignore */
  }
  return { before, after: fileSize(DB_FILE) }
}
