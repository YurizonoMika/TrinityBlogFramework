// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import { db } from '../db.js'
import { hashPassword, publicUser, requireAuth, requireAdmin } from '../auth.js'

const router = Router()

const CAPS = ['post', 'moment', 'plugins']

function normalizePermissions(input) {
  const out = {}
  for (const cap of CAPS) out[cap] = Boolean(input && input[cap])
  return out
}

function userStats(id) {
  const posts = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE author_id = ?').get(id).n
  const moments = db.prepare('SELECT COUNT(*) AS n FROM moments WHERE author_id = ?').get(id).n
  return { posts, moments }
}

function publicProfile(user) {
  if (!user) return null
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar: user.avatar,
    bio: user.bio,
    role: user.role,
    created_at: user.created_at,
  }
}

// ---- public profile by username (for /user/:username) ----
router.get('/public/:username', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.params.username))
  if (!user) return res.status(404).json({ error: '用户不存在' })
  res.json({ user: publicProfile(user) })
})

// ---- management (admin) ----
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY id ASC').all()
  res.json({
    users: rows.map((u) => ({ ...publicUser(u), ...userStats(u.id) })),
  })
})

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const body = req.body || {}
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: '用户名需为 3-32 位字母、数字、下划线或连字符' })
  }
  if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' })
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: '用户名已被占用' })
  }
  const role = body.role === 'admin' ? 'admin' : 'user'
  const permissions = normalizePermissions(body.permissions)
  const pluginPermissions = Array.isArray(body.pluginPermissions)
    ? body.pluginPermissions.map(String)
    : ['storage']
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, display_name, email, bio, role, permissions, plugin_permissions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      username,
      hashPassword(password),
      String(body.displayName || username),
      String(body.email || ''),
      String(body.bio || ''),
      role,
      JSON.stringify(permissions),
      JSON.stringify(pluginPermissions)
    )
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)
  res.status(201).json({ user: { ...publicUser(user), ...userStats(user.id) } })
})

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!target) return res.status(404).json({ error: '用户不存在' })
  const body = req.body || {}

  const username = body.username !== undefined ? String(body.username).trim() : target.username
  if (username !== target.username) {
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) {
      return res.status(400).json({ error: '用户名格式不正确' })
    }
    if (db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, target.id)) {
      return res.status(409).json({ error: '用户名已被占用' })
    }
  }

  let role = body.role !== undefined ? (body.role === 'admin' ? 'admin' : 'user') : target.role
  // never leave the site without an admin
  if (target.role === 'admin' && role !== 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n
    if (admins <= 1) return res.status(400).json({ error: '至少需要保留一名管理员' })
  }

  const permissions =
    body.permissions !== undefined ? normalizePermissions(body.permissions) : undefined
  const pluginPermissions =
    body.pluginPermissions !== undefined
      ? (Array.isArray(body.pluginPermissions) ? body.pluginPermissions.map(String) : [])
      : undefined
  const passwordHash = body.password ? hashPassword(String(body.password)) : target.password_hash

  db.prepare(
    `UPDATE users SET username = ?, display_name = ?, email = ?, bio = ?, role = ?,
       permissions = ?, plugin_permissions = ?, password_hash = ? WHERE id = ?`
  ).run(
    username,
    body.displayName !== undefined ? String(body.displayName) : target.display_name,
    body.email !== undefined ? String(body.email) : target.email,
    body.bio !== undefined ? String(body.bio) : target.bio,
    role,
    permissions !== undefined ? JSON.stringify(permissions) : target.permissions,
    pluginPermissions !== undefined ? JSON.stringify(pluginPermissions) : target.plugin_permissions,
    passwordHash,
    target.id
  )
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)
  res.json({ user: { ...publicUser(user), ...userStats(user.id) } })
})

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!target) return res.status(404).json({ error: '用户不存在' })
  if (target.id === req.user.id) return res.status(400).json({ error: '不能删除自己' })
  if (target.role === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n
    if (admins <= 1) return res.status(400).json({ error: '至少需要保留一名管理员' })
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id)
  db.prepare('DELETE FROM cards WHERE user_id = ?').run(target.id)
  db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(target.id)
  res.json({ ok: true })
})

export default router
