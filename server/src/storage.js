// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { statfsSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR, UPLOAD_DIR, db, getSetting } from './db.js'
import {
  PLUGINS_DIR,
  PLUGIN_DATA_DIR,
  listPlugins,
  pluginStorageDir,
  listPluginStorage,
} from './plugins.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = join(__dirname, '..')
const APP_DIR = join(SERVER_DIR, '..')
const WEB_DIST = join(APP_DIR, 'web', 'dist')
const NODE_MODULES = join(APP_DIR, 'node_modules')
const DB_FILE = join(DATA_DIR, 'homepage.db')

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

/** Recursively sum file sizes; optionally skip a sub-path. */
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

/** Extract a filename from any `/uploads/<name>` reference (relative or absolute URL). */
function uploadName(ref) {
  const m = String(ref || '').match(/\/uploads\/([^"')\s>?#]+)/)
  if (!m) return null
  let name = m[1]
  try {
    name = decodeURIComponent(name)
  } catch {
    /* keep raw */
  }
  return basename(name)
}

function scanUploadNames(text, out) {
  const re = /\/uploads\/[^"')\s>?#]+/g
  let m
  while ((m = re.exec(String(text || '')))) {
    const name = uploadName(m[0])
    if (name) out.add(name)
  }
}

/** Which upload files are referenced by posts / moments / site assets. */
function collectReferences() {
  const posts = new Set()
  const moments = new Set()
  const site = new Set()

  for (const row of db.prepare('SELECT cover, content FROM posts').all()) {
    const n1 = uploadName(row.cover)
    if (n1) posts.add(n1)
    scanUploadNames(row.content, posts)
  }
  for (const row of db.prepare('SELECT content, images FROM moments').all()) {
    for (const url of safeJsonArray(row.images)) {
      const n = uploadName(url)
      if (n) moments.add(n)
    }
    scanUploadNames(row.content, moments)
  }

  const siteSettings = getSetting('site', {}) || {}
  for (const key of ['icon', 'banner']) {
    const n = uploadName(siteSettings[key])
    if (n) site.add(n)
  }
  for (const row of db.prepare('SELECT avatar FROM users').all()) {
    const n = uploadName(row.avatar)
    if (n) site.add(n)
  }

  return { posts, moments, site }
}

function listUploadFiles() {
  if (!existsSync(UPLOAD_DIR)) return []
  return readdirSync(UPLOAD_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => ({ name: e.name, size: fileSize(join(UPLOAD_DIR, e.name)) }))
}

function sumByName(files, names) {
  let bytes = 0
  let count = 0
  for (const f of files) {
    if (names.has(f.name)) {
      bytes += f.size
      count++
    }
  }
  return { bytes, count }
}

export function getStorageOverview() {
  const refs = collectReferences()
  const uploads = listUploadFiles()

  const posts = sumByName(uploads, refs.posts)
  const moments = sumByName(uploads, refs.moments)
  // everything not used by posts/moments belongs to the site system
  // (site icon/banner/avatar + orphaned files)
  const contentRefs = new Set([...refs.posts, ...refs.moments])
  let systemUploadBytes = 0
  let orphanBytes = 0
  let orphanCount = 0
  let totalUploadBytes = 0
  for (const f of uploads) {
    totalUploadBytes += f.size
    if (contentRefs.has(f.name)) continue
    systemUploadBytes += f.size
    if (!refs.site.has(f.name)) {
      orphanBytes += f.size
      orphanCount++
    }
  }
  const referencedUploadBytes = totalUploadBytes - systemUploadBytes

  const dbBytes = fileSize(DB_FILE) + fileSize(DB_FILE + '-wal') + fileSize(DB_FILE + '-shm')
  const pluginsDataBytes = dirSize(PLUGIN_DATA_DIR)
  const configBytes = Math.max(0, dirSize(DATA_DIR, PLUGIN_DATA_DIR) - dbBytes)

  const plugins = listPlugins().map((p) => {
    const files = listPluginStorage(p.id)
    return {
      id: p.id,
      name: p.name,
      enabled: p.enabled,
      bytes: files.reduce((s, f) => s + f.size, 0),
      files: files.length,
    }
  })
  plugins.sort((a, b) => b.bytes - a.bytes)

  const parts = [
    { id: 'database', label: '数据库', bytes: dbBytes },
    { id: 'uploads', label: '上传文件', bytes: totalUploadBytes },
    { id: 'plugins', label: '插件数据', bytes: pluginsDataBytes },
    { id: 'plugin-code', label: '插件代码', bytes: dirSize(PLUGINS_DIR) },
    { id: 'dist', label: '前端构建', bytes: dirSize(WEB_DIST) },
    { id: 'server', label: '服务端代码', bytes: dirSize(SERVER_DIR, join(SERVER_DIR, 'node_modules')) },
    { id: 'deps', label: '依赖 (node_modules)', bytes: dirSize(NODE_MODULES) },
  ]
  const siteBytes = parts.reduce((s, p) => s + p.bytes, 0)

  return {
    disk: diskUsage(APP_DIR),
    site: { bytes: siteBytes, parts },
    uploads: { total: totalUploadBytes, referenced: referencedUploadBytes, orphan: orphanBytes, orphanCount },
    categories: {
      posts: { bytes: posts.bytes, files: posts.count },
      moments: { bytes: moments.bytes, files: moments.count },
      system: { bytes: dbBytes + configBytes + systemUploadBytes, detail: { database: dbBytes, config: configBytes, uploads: systemUploadBytes } },
      plugins,
    },
  }
}

/** Delete upload files referenced by nothing (removes orphans only; content is untouched). */
export function cleanOrphanUploads() {
  const refs = collectReferences()
  const referenced = new Set([...refs.posts, ...refs.moments, ...refs.site])
  let removed = 0
  let bytes = 0
  for (const f of listUploadFiles()) {
    if (referenced.has(f.name)) continue
    try {
      rmSync(join(UPLOAD_DIR, f.name), { force: true })
      removed++
      bytes += f.size
    } catch {
      /* ignore */
    }
  }
  return { removed, bytes }
}

/** Remove every file stored by a plugin. */
export function clearPluginStorage(id) {
  const dir = pluginStorageDir(id) // validates the id
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

/** Reclaim space in the SQLite database. */
export function vacuumDatabase() {
  const before = fileSize(DB_FILE)
  try {
    db.exec('VACUUM')
  } catch {
    /* ignore */
  }
  return { before, after: fileSize(DB_FILE) }
}
