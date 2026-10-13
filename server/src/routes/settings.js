// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import { db, getSetting, setSetting } from '../db.js'
import { requireAuth, hashPassword, verifyPassword, publicUser } from '../auth.js'
import { extractSeedColor, resolveThemeSource } from '../seed.js'
import { resetNintendoConfig } from '../nintendo.js'

const router = Router()

function adminUser() {
  return db.prepare('SELECT * FROM users ORDER BY id ASC LIMIT 1').get()
}

export function publicProfile() {
  const user = adminUser()
  if (!user) return null
  const u = publicUser(user)
  return {
    display_name: u.display_name,
    username: u.username,
    avatar: u.avatar,
    bio: u.bio,
    email: u.email,
    links: getSetting('links', []),
    tags: getSetting('tags', []),
  }
}

router.get('/public', (req, res) => {
  res.json({
    site: getSetting('site', {}),
    profile: publicProfile(),
    categories: getSetting('categories', []),
    integrations: {
      github: { username: getSetting('integrations', {}).github?.username || '' },
      steam: { steamId: getSetting('integrations', {}).steam?.steamId || '' },
      nintendo: { friendCode: getSetting('integrations', {}).nintendo?.friendCode || '' },
    },
  })
})

router.get('/', requireAuth, (req, res) => {
  const user = publicUser(req.user)
  res.json({
    site: getSetting('site', {}),
    integrations: getSetting('integrations', {}),
    links: getSetting('links', []),
    tags: getSetting('tags', []),
    categories: getSetting('categories', []),
    profile: user,
  })
})

router.put('/site', requireAuth, async (req, res) => {
  const current = getSetting('site', {})
  const next = { ...current, ...(req.body || {}) }

  if (next.themeMode === 'dynamic') {
    const source = resolveThemeSource(next)
    const seed = source ? await extractSeedColor(source) : null
    if (seed) next.themeSeedColor = seed
    else delete next.themeSeedColor
  } else {
    delete next.themeSeedColor
  }

  res.json({ site: setSetting('site', next) })
})

router.put('/integrations', requireAuth, (req, res) => {
  const current = getSetting('integrations', {})
  const incoming = req.body || {}
  const next = { ...current }
  for (const key of ['github', 'steam', 'nintendo']) {
    if (incoming[key]) next[key] = { ...(current[key] || {}), ...incoming[key] }
  }
  const saved = setSetting('integrations', next)
  // the nxapi client id/secret / proxy URL may have changed
  resetNintendoConfig()
  res.json({ integrations: saved })
})

router.put('/links', requireAuth, (req, res) => {
  const links = Array.isArray(req.body?.links) ? req.body.links : []
  res.json({ links: setSetting('links', links) })
})

router.put('/tags', requireAuth, (req, res) => {
  const tags = Array.isArray(req.body?.tags) ? req.body.tags : []
  res.json({ tags: setSetting('tags', tags) })
})

router.put('/categories', requireAuth, (req, res) => {
  const raw = Array.isArray(req.body?.categories) ? req.body.categories : []
  const categories = [...new Set(raw.map((c) => String(c).trim()).filter(Boolean))]
  res.json({ categories: setSetting('categories', categories) })
})

router.put('/profile', requireAuth, (req, res) => {
  const { display_name, email, avatar, bio } = req.body || {}
  db.prepare(
    `UPDATE users SET display_name = ?, email = ?, avatar = ?, bio = ? WHERE id = ?`
  ).run(
    display_name ?? req.user.display_name,
    email ?? req.user.email,
    avatar ?? req.user.avatar,
    bio ?? req.user.bio,
    req.user.id
  )
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  res.json({ profile: publicUser(user) })
})

router.put('/account', requireAuth, (req, res) => {
  const { username, currentPassword, newPassword } = req.body || {}
  const user = req.user

  if (newPassword) {
    if (!currentPassword || !verifyPassword(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: '当前密码不正确' })
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: '新密码至少需要 6 位' })
    }
  }

  const nextUsername = username?.trim() || user.username
  if (nextUsername !== user.username) {
    const exists = db
      .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
      .get(nextUsername, user.id)
    if (exists) return res.status(409).json({ error: '用户名已被占用' })
  }

  db.prepare(
    `UPDATE users SET username = ?, password_hash = ? WHERE id = ?`
  ).run(
    nextUsername,
    newPassword ? hashPassword(newPassword) : user.password_hash,
    user.id
  )
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
  res.json({ profile: publicUser(updated) })
})

export default router
