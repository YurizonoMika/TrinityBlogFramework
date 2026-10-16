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

/** Administrator (admin) or super administrator (super). */
export function isAdminUser(user) {
  return Boolean(user && (user.role === 'admin' || user.role === 'super'))
}

/** Whether a user has a capability (admins & super admins have everything). */
export function can(user, cap) {
  if (!user) return false
  if (isAdminUser(user)) return true
  const perms = safeParse(user.permissions, {})
  return Boolean(perms[cap])
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '未登录' })
  if (!isAdminUser(req.user)) return res.status(403).json({ error: '需要管理员权限' })
  next()
}

/** Only the single super administrator (site owner). */
export function requireSuper(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '未登录' })
  if (req.user.role !== 'super') return res.status(403).json({ error: '需要超级管理员权限' })
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
  return Boolean(sessionUser(req))
}

/* ---------------- session cookie ---------------- */

const SESSION_COOKIE = 'hp_session'
const FLAG_COOKIE = 'hp_logged_in'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60

function parseCookies(header) {
  const out = {}
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    if (key) out[key] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

/** Set the HttpOnly session cookie (+ a readable flag cookie for the SPA). */
export function setSessionCookie(res, token, secure) {
  const base = `Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`
  const sec = secure ? '; Secure' : ''
  res.append('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; ${base}${sec}`)
  res.append('Set-Cookie', `${FLAG_COOKIE}=1; ${base}${sec}`)
}

export function clearSessionCookie(res) {
  res.append('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`)
  res.append('Set-Cookie', `${FLAG_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`)
}

/**
 * Resolve the logged-in user from the HttpOnly session cookie (preferred) or a
 * `Authorization: Bearer` header (API clients / plugin share links).
 */
export function sessionUser(req) {
  const cookies = parseCookies(req.headers.cookie)
  const header = req.headers.authorization || ''
  const token = cookies[SESSION_COOKIE] || (header.startsWith('Bearer ') ? header.slice(7) : null)
  if (!token) return null
  const payload = verifyToken(token)
  if (!payload) return null
  return db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) || null
}

/* naive in-memory brute-force guard: 10 attempts per 10 minutes per identity */
const attemptLog = new Map() // `${ip}|${identity}` -> { count, first }
const RATE_WINDOW = 10 * 60 * 1000
const RATE_MAX = 10
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of attemptLog) {
    if (now - entry.first > RATE_WINDOW) attemptLog.delete(key)
  }
}, RATE_WINDOW).unref?.()

export function allowLoginAttempt(ip, identity) {
  const key = `${ip}|${String(identity || '').toLowerCase()}`
  const now = Date.now()
  let entry = attemptLog.get(key)
  if (!entry || now - entry.first > RATE_WINDOW) {
    entry = { count: 0, first: now }
    attemptLog.set(key, entry)
  }
  entry.count += 1
  return entry.count <= RATE_MAX
}

export function requireAuth(req, res, next) {
  const user = sessionUser(req)
  if (!user) return res.status(401).json({ error: '未登录' })
  req.user = user
  next()
}
