// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import AdmZip from 'adm-zip'
import { DATA_DIR, db, getUserSetting, primaryUserId } from './db.js'
import { SDK_VERSION, sdkSatisfies } from './sdk.js'

/**
 * Themes are stored as folders under DATA_DIR/themes/<id>/ and contain:
 *   theme.json   { id, name, version, author, description }
 *   theme.css    arbitrary CSS (overrides --md-* tokens and UI styles/layout)
 *   icons.json   optional { iconName: "svg path d" } overrides for AppIcon
 * Themes are imported by administrators only.
 */
const THEMES_DIR = join(DATA_DIR, 'themes')
mkdirSync(THEMES_DIR, { recursive: true })
const ID_RE = /^[a-z0-9][a-z0-9-]*$/

function themeDir(id) {
  if (!ID_RE.test(id)) throw new Error('无效的主题 id')
  return join(THEMES_DIR, id)
}
function readMeta(id) {
  try {
    return JSON.parse(readFileSync(join(themeDir(id), 'theme.json'), 'utf-8'))
  } catch {
    return null
  }
}
function readCss(id) {
  try {
    return readFileSync(join(themeDir(id), 'theme.css'), 'utf-8')
  } catch {
    return ''
  }
}
function readIcons(id) {
  try {
    const j = JSON.parse(readFileSync(join(themeDir(id), 'icons.json'), 'utf-8'))
    return j && typeof j === 'object' ? j : {}
  } catch {
    return {}
  }
}
/** Optional `theme.html` — injected once into the DOM (e.g. an inline <svg>
 *  holding filters used by the theme's `backdrop-filter: url(#id)`). */
function readHtml(id) {
  try {
    return readFileSync(join(themeDir(id), 'theme.html'), 'utf-8')
  } catch {
    return ''
  }
}

/** Public asset URL for a file inside the theme folder. */
function assetUrl(id, rel) {
  if (!rel) return ''
  return `/api/themes/${id}/asset/${String(rel).replace(/^\/+/, '')}`
}

/** Resolve a safe on-disk path for a theme asset (path-traversal guarded). */
export function themeAssetPath(id, rel) {
  const clean = String(rel || '').replace(/^\/+/, '')
  if (!clean || clean.includes('..')) return null
  const p = join(themeDir(id), clean)
  return existsSync(p) ? p : null
}

/** Declared, user-configurable theme options (with defaults). */
function themeOptions(meta) {
  const list = Array.isArray(meta?.options) ? meta.options : []
  return list
    .filter((o) => o && typeof o.id === 'string' && /^[a-z0-9-]+$/i.test(o.id))
    .map((o) => ({
      id: String(o.id),
      label: String(o.label || o.id).slice(0, 60),
      type: ['color', 'text', 'select', 'boolean', 'image'].includes(o.type) ? o.type : 'text',
      default: o.default ?? (o.type === 'boolean' ? false : ''),
      options: Array.isArray(o.options) ? o.options.map((v) => String(v)) : undefined,
    }))
}

/** Color schemes embedded by a theme — can override the site's default palettes. */
function themeSchemes(meta) {
  const list = Array.isArray(meta?.schemes) ? meta.schemes : []
  return list
    .filter((s) => s && typeof s.id === 'string' && /^[a-z0-9-]+$/i.test(s.id))
    .map((s) => {
      const vars = {}
      if (s.vars && typeof s.vars === 'object') {
        for (const [k, v] of Object.entries(s.vars)) {
          if (/^--[a-z0-9-]+$/i.test(k) && (typeof v === 'string' || typeof v === 'number')) {
            vars[k] = String(v).slice(0, 200)
          }
        }
      }
      return {
        id: String(s.id),
        label: String(s.label || s.id).slice(0, 60),
        color: /^#[0-9a-f]{3,8}$/i.test(String(s.color || '')) ? String(s.color) : '',
        vars,
      }
    })
}

export function listThemes() {
  let dirs = []
  try {
    dirs = readdirSync(THEMES_DIR, { withFileTypes: true })
  } catch {
    return []
  }
  return dirs
    .filter((d) => d.isDirectory() && ID_RE.test(d.name) && existsSync(join(THEMES_DIR, d.name, 'theme.json')))
    .map((d) => {
      const m = readMeta(d.name) || { id: d.name, name: d.name }
      return {
        id: d.name,
        name: m.name || d.name,
        version: m.version || '0.0.0',
        author: m.author || '',
        description: m.description || '',
        preview: m.preview ? assetUrl(d.name, m.preview) : '',
        minSdkVersion: String(m.minSdkVersion || ''),
        options: themeOptions(m),
        schemes: themeSchemes(m),
      }
    })
}

function parsePackage(buffer) {
  let zip
  try {
    zip = new AdmZip(buffer)
  } catch {
    throw new Error('无效的 zip 文件')
  }
  let prefix = ''
  let entry = zip.getEntry('theme.json')
  if (!entry) {
    const candidates = zip.getEntries().filter((e) => !e.isDirectory && /^[^/]+\/theme\.json$/.test(e.entryName))
    if (candidates.length === 1) {
      entry = candidates[0]
      prefix = candidates[0].entryName.replace(/theme\.json$/, '')
    }
  }
  if (!entry) throw new Error('主题包缺少 theme.json')
  let meta
  try {
    meta = JSON.parse(entry.getData().toString('utf-8'))
  } catch {
    throw new Error('theme.json 解析失败')
  }
  const id = String(meta.id || '').trim()
  if (!ID_RE.test(id)) throw new Error('theme.json 的 id 无效（只允许小写字母、数字、连字符）')
  if (!meta.name) throw new Error('theme.json 缺少 name')
  return { zip, meta, id, prefix }
}

export function inspectTheme(buffer) {
  const { meta, id } = parsePackage(buffer)
  const minSdkVersion = String(meta.minSdkVersion || '')
  return {
    id,
    name: meta.name,
    version: meta.version || '0.0.0',
    author: meta.author || '',
    description: meta.description || '',
    preview: meta.preview ? assetUrl(id, meta.preview) : '',
    minSdkVersion,
    sdkVersion: SDK_VERSION,
    sdkOk: sdkSatisfies(minSdkVersion),
    options: themeOptions(meta),
    schemes: themeSchemes(meta),
    exists: existsSync(join(themeDir(id), 'theme.json')),
  }
}

export function importTheme(buffer) {
  const { zip, meta, id, prefix } = parsePackage(buffer)
  const minSdkVersion = String(meta.minSdkVersion || '')
  if (!sdkSatisfies(minSdkVersion)) {
    throw new Error(`该主题要求 SDK 版本 ≥ ${minSdkVersion}，当前站点 SDK 为 ${SDK_VERSION}，无法安装`)
  }
  const dir = themeDir(id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const item of zip.getEntries()) {
    if (item.isDirectory) continue
    let name = item.entryName.replace(/^\.?\//, '')
    if (prefix && name.startsWith(prefix)) name = name.slice(prefix.length)
    if (!name || name.includes('..')) continue
    const target = join(dir, name)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, item.getData())
  }
  return listThemes().find((t) => t.id === id) || null
}

export function deleteTheme(id) {
  rmSync(themeDir(id), { recursive: true, force: true })
}

/** The theme a given page owner has applied (resolved to its css/icons). */
export function themeForUser(username) {
  let user
  if (username) {
    user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username))
  } else {
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(primaryUserId())
  }
  if (!user) return { theme: null }
  const id = getUserSetting(user.id, 'theme', '') || ''
  if (!id || !ID_RE.test(id)) return { theme: null }
  const meta = readMeta(id)
  if (!meta) return { theme: null }
  const hasCss = existsSync(join(themeDir(id), 'theme.css'))
  const savedValues = getUserSetting(user.id, 'theme_options', {}) || {}
  const defs = themeOptions(meta)
  const values = {}
  for (const o of defs) {
    const v = savedValues[o.id]
    values[o.id] = v === undefined ? o.default : v
  }
  const schemes = themeSchemes(meta)
  const schemeIds = new Set(schemes.map((s) => s.id))
  let scheme = String(savedValues.scheme || '')
  if (!schemeIds.has(scheme)) scheme = String(meta.defaultScheme || '')
  if (!schemeIds.has(scheme)) scheme = schemes[0]?.id || ''
  return {
    theme: {
      id,
      name: meta.name || id,
      version: meta.version || '',
      hasCss,
      cssUrl: hasCss ? assetUrl(id, 'theme.css') : '',
      icons: readIcons(id),
      html: readHtml(id),
      preview: meta.preview ? assetUrl(id, meta.preview) : '',
      options: defs,
      values,
      schemes,
      scheme,
    },
  }
}

export function themeExists(id) {
  return ID_RE.test(String(id || '')) && existsSync(join(THEMES_DIR, String(id), 'theme.json'))
}
