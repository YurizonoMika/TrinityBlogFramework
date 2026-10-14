// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import { db } from '../db.js'
import {
  verifyPassword,
  signToken,
  publicUser,
  requireAuth,
  allowLoginAttempt,
  setSessionCookie,
  clearSessionCookie,
} from '../auth.js'

const router = Router()

function isSecure(req) {
  return Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https')
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' })
  }
  if (!allowLoginAttempt(req.ip, username)) {
    return res.status(429).json({ error: '尝试过于频繁，请稍后再试' })
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' })
  }
  setSessionCookie(res, signToken(user), isSecure(req))
  res.json({ user: publicUser(user) })
})

router.post('/logout', (req, res) => {
  clearSessionCookie(res)
  res.json({ ok: true })
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) })
})

export default router
