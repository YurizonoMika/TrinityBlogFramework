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

export function publicUser(user) {
  if (!user) return null
  const { password_hash, ...rest } = user
  return rest
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
