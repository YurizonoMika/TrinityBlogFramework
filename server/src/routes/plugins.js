// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import { extname } from 'node:path'
import { db, primaryUserId } from '../db.js'
import { requireAuth, requireAdmin, verifyToken, can, sessionUser, isAdminUser } from '../auth.js'
import { pageUsername } from '../scope.js'
import {
  listPlugins,
  inspectPlugin,
  importPlugin,
  deletePlugin,
  updatePluginState,
  getRuntimeManifest,
  getPluginStates,
  getPluginUi,
  pluginAssetPath,
  callRoute,
  resolveApiEndpoint,
  callApi,
  getPluginToken,
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

/**
 * Resolve the user whose plugins this request targets.
 *
 * Account isolation: an authenticated request is ALWAYS scoped to the session
 * user (only admins may target another user with `?username=`). Anonymous
 * requests may render a page owner's `visitor` plugins (via `?username=` or the
 * referer), otherwise they fall back to the site owner.
 * This guarantees a plugin can never read another user's storage/data.
 */
function ownerFrom(req) {
  const viewer = sessionUser(req)
  if (viewer) {
    if (isAdminUser(viewer) && req.query.username) {
      const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.query.username))
      if (u) return u
    }
    return viewer
  }
  const username = pageUsername(req)
  if (username) {
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username))
    if (u) return u
  }
  return db.prepare('SELECT * FROM users WHERE id = ?').get(primaryUserId())
}

/** The owner an *outward* (public/token) API endpoint targets: `?username=` /
 *  page owner, otherwise the site owner. Unlike `ownerFrom`, the caller's
 *  session does not change the target — any logged-in visitor may call a
 *  public endpoint. */
function publicOwnerFrom(req) {
  const username = pageUsername(req)
  if (username) {
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username))
    if (u) return u
  }
  return db.prepare('SELECT * FROM users WHERE id = ?').get(primaryUserId())
}

function manageOwner(req) {
  if (isAdminUser(req.user) && req.query.username) {
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.query.username))
    if (u) return u
  }
  return req.user
}

function canManage(req, owner) {
  if (!req.user || !owner) return false
  if (isAdminUser(req.user)) return true
  return req.user.id === owner.id && can(req.user, 'plugins')
}

/** Resolve the requesting user from `req.user`, the Bearer header, or a
 *  `?token=` stand-in — but only owner/admin may access non-visitor plugins. */
function resolvePluginUser(req, ownerId) {
  if (req.user) return req.user
  const viaSession = sessionUser(req) // HttpOnly cookie or Bearer header
  if (viaSession) return viaSession
  if (req.query.token) {
    const payload = verifyToken(String(req.query.token))
    if (payload) {
      return db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) || null
    }
  }
  return null
}

function canAccess(owner, id, req) {
  if (!owner) return false
  const state = getPluginStates(owner.id)[id]
  if (!state || !state.enabled) return false
  if (state.visitor) return true
  const user = resolvePluginUser(req, owner.id)
  return Boolean(user && (isAdminUser(user) || user.id === owner.id))
}

// ---- management ----
router.get('/manage', requireAuth, (req, res) => {
  const owner = manageOwner(req)
  if (!canManage(req, owner)) return res.status(403).json({ error: '没有权限' })
  res.json({ plugins: listPlugins(owner.id) })
})

router.post('/inspect', requireAuth, requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有收到文件' })
  const owner = manageOwner(req)
  try {
    res.json({ plugin: inspectPlugin(req.file.buffer, owner ? owner.id : null) })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

router.post('/import', requireAuth, requireAdmin, upload.single('file'), (req, res) => {
  const owner = manageOwner(req)
  if (!owner) return res.status(400).json({ error: '没有权限' })
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
  // running a plugin (server-side + in visitors' browsers) and locking it are
  // admin-only actions
  if (
    (patch.enabled !== undefined || patch.visitor !== undefined || patch.locked !== undefined) &&
    !isAdminUser(req.user)
  ) {
    return res.status(403).json({ error: '仅管理员可以启用插件、对访客公开或锁定插件' })
  }
  // non-admins may only grant plugin permissions the admin allowed for them
  if (patch.permissions !== undefined && !isAdminUser(req.user)) {
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
  // an admin-locked plugin can only be deleted by an admin
  const locked = Boolean(getPluginStates(owner.id)[req.params.id]?.locked)
  if (locked && !isAdminUser(req.user)) {
    return res.status(403).json({ error: '该插件已被管理员锁定，禁止删除' })
  }
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
  const viewer = sessionUser(req)
  // only the owner's own session may load their private (non-visitor) plugins
  const canSeePrivate = Boolean(viewer && owner && viewer.id === owner.id)
  res.json({ plugins: getRuntimeManifest(canSeePrivate, owner ? owner.id : primaryUserId()) })
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
    const caller = resolvePluginUser(req, owner.id)
    const authed = Boolean(caller && (isAdminUser(caller) || caller.id === owner.id))
    const result = await callRoute(owner.id, req.params.id, req.params.name, {
      method: req.method,
      query: req.query,
      params: req.params,
      body: req.body,
      path: req.path,
      authed,
      isAdmin: Boolean(caller && isAdminUser(caller)),
      viewer: caller ? { id: caller.id, username: caller.username } : null,
      // client IP (respects `trust proxy`) — plugins may use it for e.g.
      // "has this visitor already taken part?" checks
      ip: req.ip || '',
    })
    if (result === undefined || result === null) return res.json({ ok: true })
    res.json({ data: result })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
}

router.get('/:id/call/:name', handleCall)
router.post('/:id/call/:name', handleCall)

/* ------------------------------------------------------------------ */
/* outward-facing plugin API                                           */
/* ------------------------------------------------------------------ */

function applyApiCors(res, methods) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', [...new Set([...methods, 'OPTIONS'])].join(', '))
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  res.setHeader('Access-Control-Expose-Headers', '*')
  res.setHeader('Access-Control-Max-Age', '86400')
}

function bearerToken(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')
  return match ? match[1].trim() : ''
}

function tokenEquals(a, b) {
  const x = Buffer.from(String(a || ''))
  const y = Buffer.from(String(b || ''))
  if (!x.length || x.length !== y.length) return false
  return crypto.timingSafeEqual(x, y)
}

function makeApiReply() {
  const reply = {
    statusCode: 200,
    headers: {},
    sent: false,
    jsonBody: false,
    body: undefined,
    status(code) {
      const n = Number(code)
      if (Number.isInteger(n) && n >= 100 && n <= 599) reply.statusCode = n
      return reply
    },
    header(name, value) {
      if (name) reply.headers[String(name)] = String(value)
      return reply
    },
    type(value) {
      if (value) reply.headers['Content-Type'] = String(value)
      return reply
    },
    json(data) {
      reply.body = data
      reply.jsonBody = true
      reply.sent = true
      return reply
    },
    send(data) {
      reply.body = data
      reply.jsonBody = false
      reply.sent = true
      return reply
    },
    end() {
      reply.body = undefined
      reply.sent = true
      return reply
    },
  }
  return reply
}

async function handleApi(req, res) {
  const id = req.params.id
  // Public endpoints target the explicit/page owner or the site owner even when
  // the caller is logged in as someone else. Non-public endpoints stay scoped
  // to the caller's session (account isolation).
  const publicOwner = publicOwnerFrom(req)
  const sessionOwner = ownerFrom(req)

  let owner = null
  let state = null
  let resolved = null

  if (publicOwner) {
    const publicState = getPluginStates(publicOwner.id)[id]
    if (publicState?.enabled) {
      const candidate = resolveApiEndpoint(publicOwner.id, id, req.params[0], req.method)
      const outward = candidate?.endpoint.auth === 'public' || candidate?.endpoint.auth === 'token'
      if (outward && (candidate.endpoint.auth !== 'public' || publicState.visitor)) {
        owner = publicOwner
        state = publicState
        resolved = candidate
      }
    }
  }
  if (!resolved && sessionOwner) {
    const sessionState = getPluginStates(sessionOwner.id)[id]
    if (sessionState?.enabled) {
      const candidate = resolveApiEndpoint(sessionOwner.id, id, req.params[0], req.method)
      if (candidate) {
        owner = sessionOwner
        state = sessionState
        resolved = candidate
      }
    }
  }
  if (!owner || !state || !resolved) return res.status(404).json({ error: '接口不存在' })

  const endpoint = resolved.endpoint

  if (endpoint.cors) applyApiCors(res, resolved.allowed)
  if (req.method === 'OPTIONS' && endpoint.cors) return res.status(204).end()
  if (!resolved.methodMatched) {
    const allow = [...new Set(resolved.allowed.flatMap((m) => (m === 'GET' ? ['GET', 'HEAD'] : [m])))]
    res.setHeader('Allow', allow.join(', '))
    return res.status(405).json({ error: '请求方法不被允许' })
  }
  if (!resolved.handler) return res.status(404).json({ error: '接口未实现' })

  // an endpoint is only exposed publicly after the owner explicitly publishes
  // the plugin to visitors
  if (endpoint.auth === 'public' && !state.visitor) {
    return res.status(404).json({ error: '接口不存在' })
  }

  const caller = resolvePluginUser(req, owner.id)
  const isOwner = Boolean(caller && caller.id === owner.id)
  const isAdmin = Boolean(caller && isAdminUser(caller))
  const bearer = bearerToken(req)

  if (endpoint.auth === 'owner' && !(isOwner || isAdmin)) {
    return res.status(403).json({ error: '没有权限' })
  }
  if (endpoint.auth === 'admin' && !isAdmin) {
    return res.status(403).json({ error: '需要管理员权限' })
  }
  if (endpoint.auth === 'token') {
    if (!Array.isArray(state.permissions) || !state.permissions.includes('token')) {
      return res.status(403).json({ error: '插件未获得 token 权限' })
    }
    const expected = getPluginToken(owner.id, id)
    if (!expected) return res.status(503).json({ error: '未配置 API 令牌' })
    if (!isOwner && !isAdmin && !tokenEquals(bearer, expected)) {
      return res.status(401).json({ error: 'API 令牌无效' })
    }
  }

  // keep cookie-authenticated owner/admin endpoints safe from CSRF; external
  // clients should send a Bearer token instead
  const stateChanging = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
  if (
    stateChanging &&
    (endpoint.auth === 'owner' || endpoint.auth === 'admin') &&
    !bearer &&
    req.get('x-requested-with') !== 'XMLHttpRequest'
  ) {
    return res.status(403).json({ error: '请求被拒绝（缺少 CSRF 标记）' })
  }

  // never hand session cookies or credentials to plugin code
  const headers = { ...req.headers }
  delete headers.cookie
  delete headers.authorization

  const reply = makeApiReply()
  try {
    const result = await callApi(
      owner.id,
      id,
      endpoint.name,
      {
        method: req.method,
        path: req.path,
        params: resolved.params,
        query: req.query,
        body: req.body,
        headers,
        authed: Boolean(isOwner || isAdmin),
        isAdmin,
        viewer: caller ? { id: caller.id, username: caller.username } : null,
        ip: req.ip || '',
        endpoint: { name: endpoint.name, path: endpoint.path, auth: endpoint.auth },
        apiAuth: endpoint.auth,
      },
      reply
    )
    for (const [name, value] of Object.entries(reply.headers)) res.setHeader(name, value)
    res.status(reply.statusCode)
    if (reply.sent) {
      if (reply.jsonBody) return res.json(reply.body ?? null)
      return res.send(reply.body ?? '')
    }
    if (result === undefined || result === null) return res.json({ ok: true })
    return res.json({ data: result })
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) })
  }
}

router.all('/:id/api/*', handleApi)


export default router
