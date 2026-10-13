// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import { db, isSetupComplete, seedDefaultCards, setSetting } from '../db.js'
import { hashPassword, signToken, publicUser } from '../auth.js'

const router = Router()

router.get('/status', (req, res) => {
  res.json({ setupComplete: isSetupComplete() })
})

router.post('/', (req, res) => {
  if (isSetupComplete()) {
    return res.status(409).json({ error: '管理员账户已存在' })
  }
  const { username, password, displayName } = req.body || {}
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' })
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: '密码至少需要 6 位' })
  }

  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, display_name)
       VALUES (?, ?, ?)`
    )
    .run(username, hashPassword(password), displayName || username)

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)

  seedDefaultCards()
  setSetting('site', {
    title: '我的主页',
    subtitle: '欢迎来到我的小站',
    description: '这里记录我的开发与生活。',
    accent: 'violet',
  })

  res.status(201).json({ token: signToken(user), user: publicUser(user) })
})

export default router
