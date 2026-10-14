// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import { extname } from 'node:path'
import { db, primaryUserId } from '../db.js'
import { requireAuth, isAuthed, verifyToken, can } from '../auth.js'
import { pageUsername } from '../scope.js'
import {
  listPlugins,
  importPlugin,
  deletePlugin,
  updatePluginState,
  getRuntimeManifest,
  getPluginStates,
  getPluginUi,
  pluginAssetPath,
  callRoute,
  getCardData,
  hasCardSource,
  listPluginStorage,
  pluginStorageStats,
  savePluginStorageFile,
  deletePluginStorageFile,
  deletePluginStorageBefore,
  pluginStoragePath,
} from '../plugins.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } })
const storageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024, files: 30 } })

/** Resolve the user whose plugins this request targets (defaults to the site owner). */
function ownerFrom(req) {
  const username = pageUsername(req)
  if (username) {
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username))
    if (u) return u
  }
  return db.prepare('SELECT * FROM users WHERE id = ?').get(primaryUserId())
}

function manageOwner(req) {
  if (req.user?.role === 'admin' && req.query.username) {
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.query.username))
    if (u) return u
  }
  return req.user
}

function canManage(req, owner) {
  if (!req.user || !owner) return false
  if (req.user.role === 'admin') return true
  return req.user.id === owner.id && can(req.user, 'plugins')
}

function canAccess(owner, id, req) {
  if (!owner) return false
  const state = getPluginStates(owner.id)[id]
  if (!state || !state.enabled) return false
  if (state.visitor) return true
  if (req.user && (req.user.role === 'admin' || req.user.id === owner.id)) return true
  if (isAuthed(req)) return true
  if (req.query.token && verifyToken(String(req.query.token))) return true
  return false
}

// ---- management ----
router.get('/manage', requireAuth, (req, res) => {
  const owner = manageOwner(req)
  if (!canManage(req, owner)) return res.status(403).json({ error: '没有权限' })
  res.json({ plugins: listPlugins(owner.id) })
})

router.post('/import', requireAuth, upload.single('file'), (req, res) => {
  const owner = manageOwner(req)
  if (!canManage(req, owner)) return res.status(403).json({ error: '没有权限' })
  if (!req.file) return res.status(400).json({ error: '没有收到文件' })
  try {
    const plugin = importPlugin(owner.id, req.file.buffer)
    res.status(201).json({ plugin })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

function allowedPluginPerms(owner) {
  try {
    const parsed = JSON.parse(owner.plugin_permissions || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

router.put('/:id', requireAuth, (req, res) => {
  const owner = manageOwner(req)
  if (!canManage(req, owner)) return res.status(403).json({ error: '没有权限' })
  const patch = req.body || {}
  // non-admins may only grant plugin permissions the admin allowed for them
  if (patch.permissions !== undefined && req.user.role !== 'admin') {
    const allowed = new Set(allowedPluginPerms(owner))
    const bad = (Array.isArray(patch.permissions) ? patch.permissions : []).filter((p) => !allowed.has(p))
    if (bad.length) {
      return res.status(400).json({ error: `未被授权授予插件权限：${bad.join('、')}` })
    }
  }
  try {
    const plugin = updatePluginState(owner.id, req.params.id, patch)
    res.json({ plugin })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

router.delete('/:id', requireAuth, (req, res) => {
  const owner = manageOwner(req)
  if (!canManage(req, owner)) return res.status(403).json({ error: '没有权限' })
  try {
    deletePlugin(owner.id, req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

// ---- plugin storage ----
router.get('/:id/storage', requireAuth, (req, res) => {
  const owner = manageOwner(req)
  if (!canManage(req, owner)) return res.status(403).json({ error: '没有权限' })
  res.json({ files: listPluginStorage(owner.id, req.params.id), stats: pluginStorageStats(owner.id, req.params.id) })
})

router.post('/:id/storage', requireAuth, storageUpload.array('files', 30), (req, res) => {
  const owner = manageOwner(req)
  if (!canManage(req, owner)) return res.status(403).json({ error: '没有权限' })
  const files = req.files || []
  if (!files.length) return res.status(400).json({ error: '没有收到文件' })
  const saved = []
  for (const f of files) {
    const ext = extname(f.originalname).toLowerCase() || '.bin'
    const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`
    savePluginStorageFile(owner.id, req.params.id, name, f.buffer)
    saved.push(name)
  }
  res.status(201).json({ files: saved, all: listPluginStorage(owner.id, req.params.id), stats: pluginStorageStats(owner.id, req.params.id) })
})

router.delete('/:id/storage', requireAuth, (req, res) => {
  const owner = manageOwner(req)
  if (!canManage(req, owner)) return res.status(403).json({ error: '没有权限' })
  const before = req.query.before
  if (!before) return res.status(400).json({ error: '缺少 before 参数' })
  const ms = Date.parse(String(before))
  if (Number.isNaN(ms)) return res.status(400).json({ error: 'before 日期无效' })
  const removed = deletePluginStorageBefore(owner.id, req.params.id, ms)
  res.json({ removed, stats: pluginStorageStats(owner.id, req.params.id) })
})

router.get('/:id/storage/:file', (req, res) => {
  const owner = ownerFrom(req)
  if (!canAccess(owner, req.params.id, req)) return res.status(404).json({ error: '插件不可用' })
  const p = pluginStoragePath(owner.id, req.params.id, req.params.file)
  if (!p) return res.status(404).json({ error: '文件不存在' })
  res.sendFile(p)
})

router.put('/:id/storage/:file', requireAuth, storageUpload.single('file'), (req, res) => {
  const owner = manageOwner(req)
  if (!canManage(req, owner)) return res.status(403).json({ error: '没有权限' })
  if (!req.file) return res.status(400).json({ error: '没有收到文件' })
  try {
    savePluginStorageFile(owner.id, req.params.id, req.params.file, req.file.buffer)
    res.json({ ok: true, all: listPluginStorage(owner.id, req.params.id), stats: pluginStorageStats(owner.id, req.params.id) })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

router.delete('/:id/storage/:file', requireAuth, (req, res) => {
  const owner = manageOwner(req)
  if (!canManage(req, owner)) return res.status(403).json({ error: '没有权限' })
  deletePluginStorageFile(owner.id, req.params.id, req.params.file)
  res.json({ ok: true, all: listPluginStorage(owner.id, req.params.id), stats: pluginStorageStats(owner.id, req.params.id) })
})

// ---- runtime (public, gated) ----
router.get('/runtime', (req, res) => {
  const owner = ownerFrom(req)
  res.json({ plugins: getRuntimeManifest(!isAuthed(req), owner ? owner.id : primaryUserId()) })
})

// plugin static assets (ui.js, images bundled with the plugin)
router.get('/:id/asset/*', (req, res) => {
  const owner = ownerFrom(req)
  if (!canAccess(owner, req.params.id, req)) return res.status(404).json({ error: '插件不可用' })
  const p = pluginAssetPath(owner.id, req.params.id, req.params[0])
  if (!p) return res.status(404).end()
  res.sendFile(p)
})

router.get('/:id/ui', (req, res) => {
  const owner = ownerFrom(req)
  if (!canAccess(owner, req.params.id, req)) return res.status(404).json({ error: '插件不可用' })
  const ui = getPluginUi(owner.id, req.params.id)
  if (ui === null) return res.status(404).json({ error: '插件没有 ui.ux' })
  res.type('text/plain').send(ui)
})

router.get('/:id/data/:source', async (req, res) => {
  const owner = ownerFrom(req)
  if (!canAccess(owner, req.params.id, req)) return res.status(404).json({ error: '插件不可用' })
  if (!hasCardSource(owner.id, req.params.id, req.params.source)) {
    return res.status(404).json({ error: '数据源不存在' })
  }
  try {
    const data = await getCardData(owner.id, req.params.id, req.params.source, req.query)
    res.json({ data })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

async function handleCall(req, res) {
  const owner = ownerFrom(req)
  if (!canAccess(owner, req.params.id, req)) return res.status(404).json({ error: '插件不可用' })
  try {
    const authed = isAuthed(req) || Boolean(req.query.token && verifyToken(String(req.query.token)))
    const result = await callRoute(owner.id, req.params.id, req.params.name, {
      method: req.method,
      query: req.query,
      params: req.params,
      body: req.body,
      path: req.path,
      authed,
    })
    if (result === undefined || result === null) return res.json({ ok: true })
    res.json({ data: result })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
}

router.get('/:id/call/:name', handleCall)
router.post('/:id/call/:name', handleCall)


export default router
