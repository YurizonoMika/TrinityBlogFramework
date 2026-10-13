// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import { extname } from 'node:path'
import { requireAuth, isAuthed, verifyToken } from '../auth.js'
import {
  listPlugins,
  importPlugin,
  deletePlugin,
  updatePluginState,
  getRuntimeManifest,
  getPluginStates,
  getPluginUi,
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
const storageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 30 },
})

function canAccess(id, req) {
  const state = getPluginStates()[id]
  if (!state || !state.enabled) return false
  if (state.visitor) return true
  // allow the auth token via header (api client) or query string (e.g. <img src>)
  if (isAuthed(req)) return true
  if (req.query?.token && verifyToken(String(req.query.token))) return true
  return false
}

// ---- management (auth) ----
router.get('/', requireAuth, (req, res) => {
  res.json({ plugins: listPlugins() })
})

router.post('/import', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有收到文件' })
  try {
    const plugin = importPlugin(req.file.buffer)
    res.status(201).json({ plugin })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

router.put('/:id', requireAuth, (req, res) => {
  try {
    const plugin = updatePluginState(req.params.id, req.body || {})
    res.json({ plugin })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

router.delete('/:id', requireAuth, (req, res) => {
  try {
    deletePlugin(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

// ---- plugin storage (generic) ----
router.get('/:id/storage', requireAuth, (req, res) => {
  res.json({ files: listPluginStorage(req.params.id), stats: pluginStorageStats(req.params.id) })
})

router.post('/:id/storage', requireAuth, storageUpload.array('files', 30), (req, res) => {
  const files = req.files || []
  if (!files.length) return res.status(400).json({ error: '没有收到文件' })
  const saved = []
  for (const f of files) {
    const ext = extname(f.originalname).toLowerCase() || '.bin'
    const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`
    savePluginStorageFile(req.params.id, name, f.buffer)
    saved.push(name)
  }
  res.status(201).json({
    files: saved,
    all: listPluginStorage(req.params.id),
    stats: pluginStorageStats(req.params.id),
  })
})

router.delete('/:id/storage', requireAuth, (req, res) => {
  const before = req.query.before
  if (!before) return res.status(400).json({ error: '缺少 before 参数' })
  const ms = Date.parse(String(before))
  if (Number.isNaN(ms)) return res.status(400).json({ error: 'before 日期无效' })
  const removed = deletePluginStorageBefore(req.params.id, ms)
  res.json({ removed, stats: pluginStorageStats(req.params.id) })
})

router.get('/:id/storage/:file', (req, res) => {
  if (!canAccess(req.params.id, req)) return res.status(404).json({ error: '插件不可用' })
  const p = pluginStoragePath(req.params.id, req.params.file)
  if (!p) return res.status(404).json({ error: '文件不存在' })
  res.sendFile(p)
})

// overwrite an existing file (same name)
router.put('/:id/storage/:file', requireAuth, storageUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有收到文件' })
  try {
    savePluginStorageFile(req.params.id, req.params.file, req.file.buffer)
    res.json({ ok: true, all: listPluginStorage(req.params.id), stats: pluginStorageStats(req.params.id) })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

router.delete('/:id/storage/:file', requireAuth, (req, res) => {
  deletePluginStorageFile(req.params.id, req.params.file)
  res.json({ ok: true, all: listPluginStorage(req.params.id), stats: pluginStorageStats(req.params.id) })
})

// ---- runtime (public, gated) ----
router.get('/runtime', (req, res) => {
  res.json({ plugins: getRuntimeManifest(!isAuthed(req)) })
})

router.get('/:id/ui', (req, res) => {
  if (!canAccess(req.params.id, req)) return res.status(404).json({ error: '插件不可用' })
  const ui = getPluginUi(req.params.id)
  if (ui === null) return res.status(404).json({ error: '插件没有 ui.ux' })
  res.type('text/plain').send(ui)
})

router.get('/:id/data/:source', async (req, res) => {
  if (!canAccess(req.params.id, req)) return res.status(404).json({ error: '插件不可用' })
  if (!hasCardSource(req.params.id, req.params.source)) {
    return res.status(404).json({ error: '数据源不存在' })
  }
  try {
    const data = await getCardData(req.params.id, req.params.source, req.query)
    res.json({ data })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

async function handleCall(req, res) {
  if (!canAccess(req.params.id, req)) return res.status(404).json({ error: '插件不可用' })
  try {
    const authed = isAuthed(req) || Boolean(req.query.token && verifyToken(String(req.query.token)))
    const result = await callRoute(req.params.id, req.params.name, {
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
