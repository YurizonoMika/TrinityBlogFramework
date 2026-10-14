// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { getSetting, setSetting, db } from './db.js'

function secret() {
  let s = getSetting('_jwt_secret')
  if (!s) {
    s = crypto.randomBytes(48).toString('hex')
    setSetting('_jwt_secret', s)
  }
  return s
}

const TOKEN_TTL = '7d'

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10)
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash)
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, secret(), {
    expiresIn: TOKEN_TTL,
  })
}

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value)
    return parsed == null ? fallback : parsed
  } catch {
    return fallback
  }
}

export function publicUser(user) {
  if (!user) return null
  const { password_hash, permissions, plugin_permissions, ...rest } = user
  return {
    ...rest,
    role: rest.role || 'user',
    permissions: safeParse(permissions, {}),
    pluginPermissions: safeParse(plugin_permissions, []),
  }
}

/** Whether a user has a capability (admins have everything). */
export function can(user, cap) {
  if (!user) return false
  if (user.role === 'admin') return true
  const perms = safeParse(user.permissions, {})
  return Boolean(perms[cap])
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '未登录' })
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' })
  next()
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, secret())
  } catch {
    return null
  }
}

export function isAuthed(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return false
  return Boolean(verifyToken(header.slice(7)))
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: '未登录' })
  try {
    const payload = jwt.verify(token, secret())
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub)
    if (!user) return res.status(401).json({ error: '用户不存在' })
    req.user = user
    next()
  } catch {
    return res.status(401).json({ error: '登录已失效，请重新登录' })
  }
}
