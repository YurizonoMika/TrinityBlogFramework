// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import { db, getSetting, setSetting, getUserSetting, setUserSetting, primaryUserId } from '../db.js'
import { requireAuth, requireAdmin, hashPassword, verifyPassword, publicUser } from '../auth.js'
import { extractSeedColor, resolveThemeSource } from '../seed.js'
import { pageUsername } from '../scope.js'
import { resetNintendoConfig, getNintendoServerConfig, setNintendoServerConfig } from '../nintendo.js'
import {
  getStorageOverview,
  cleanOrphanUploads,
  clearPluginStorage,
  vacuumDatabase,
} from '../storage.js'

const router = Router()

/** Admin may act on another user via ?userId=; everyone else acts on themselves. */
function targetUser(req) {
  if (req.user?.role === 'admin' && req.query.userId) {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.query.userId))
    if (u) return u
  }
  return req.user
}

function userIntegrations(userId) {
  return getUserSetting(userId, 'integrations', {})
}

/** Per-user homepage banner / welcome copy (falls back to site settings on the client). */
export function userHomepage(userId) {
  const hp = getUserSetting(userId, 'homepage', {})
  return {
    banner: hp?.banner || '',
    subtitle: hp?.subtitle || '',
    description: hp?.description || '',
  }
}

export function publicProfileFor(user) {
  if (!user) return null
  return {
    id: user.id,
    display_name: user.display_name,
    username: user.username,
    avatar: user.avatar,
    bio: user.bio,
    email: user.email,
    role: user.role,
    links: getUserSetting(user.id, 'links', []),
    tags: getUserSetting(user.id, 'tags', []),
  }
}

function buildPublic(profileUser) {
  const integrations = profileUser ? userIntegrations(profileUser.id) : {}
  return {
    site: getSetting('site', {}),
    profile: publicProfileFor(profileUser),
    homepage: profileUser ? userHomepage(profileUser.id) : { banner: '', subtitle: '', description: '' },
    categories: getSetting('categories', []),
    integrations: {
      github: { username: integrations.github?.username || '' },
      steam: { steamId: integrations.steam?.steamId || '' },
      nintendo: { friendCode: integrations.nintendo?.friendCode || '' },
    },
  }
}

// public: site + a user's public profile (defaults to the site owner)
router.get('/public', (req, res) => {
  const username = pageUsername(req)
  let user
  if (username) {
    user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username))
  } else {
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(primaryUserId())
  }
  if (!user) {
    return res.json({
      site: getSetting('site', {}),
      profile: null,
      homepage: { banner: '', subtitle: '', description: '' },
      categories: getSetting('categories', []),
      integrations: {},
    })
  }
  res.json(buildPublic(user))
})

router.get('/', requireAuth, (req, res) => {
  const target = targetUser(req)
  res.json({
    site: getSetting('site', {}),
    integrations: userIntegrations(target.id),
    links: getUserSetting(target.id, 'links', []),
    tags: getUserSetting(target.id, 'tags', []),
    categories: getSetting('categories', []),
    profile: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)),
    homepage: userHomepage(target.id),
    isAdmin: req.user.role === 'admin',
    nintendoServer: req.user.role === 'admin' ? getNintendoServerConfig() : undefined,
  })
})

// per-user homepage banner / welcome copy
router.put('/homepage', requireAuth, (req, res) => {
  const target = targetUser(req)
  const { banner, subtitle, description } = req.body || {}
  const current = getUserSetting(target.id, 'homepage', {})
  const next = {
    banner: banner !== undefined ? String(banner || '') : current.banner || '',
    subtitle: subtitle !== undefined ? String(subtitle || '') : current.subtitle || '',
    description: description !== undefined ? String(description || '') : current.description || '',
  }
  res.json({ homepage: setUserSetting(target.id, 'homepage', next) })
})

// server-level nxapi provider config (owner only)
router.put('/nintendo-server', requireAuth, requireAdmin, (req, res) => {
  res.json({ nintendoServer: setNintendoServerConfig(req.body || {}) })
})

// site-wide appearance (owner only)
router.put('/site', requireAuth, requireAdmin, async (req, res) => {
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
  const target = targetUser(req)
  const current = userIntegrations(target.id)
  const incoming = req.body || {}
  const next = { ...current }
  for (const key of ['github', 'steam']) {
    if (incoming[key]) next[key] = { ...(current[key] || {}), ...incoming[key] }
  }
  if (incoming.nintendo) {
    const n = incoming.nintendo
    next.nintendo = {
      ...(current.nintendo || {}),
      friendCode: n.friendCode ?? current.nintendo?.friendCode ?? '',
      games: Array.isArray(n.games) ? n.games : current.nintendo?.games || [],
    }
    if (req.user.role === 'admin') {
      const creds = {}
      for (const k of ['zncaApiUrl', 'clientId', 'clientSecret', 'provider', 'remoteConfig', 'configUrl']) {
        if (n[k] !== undefined) creds[k] = n[k]
      }
      if (Object.keys(creds).length) setNintendoServerConfig(creds)
    }
  }
  setUserSetting(target.id, 'integrations', next)
  resetNintendoConfig()
  res.json({
    integrations: next,
    nintendoServer: req.user.role === 'admin' ? getNintendoServerConfig() : undefined,
  })
})

router.put('/links', requireAuth, (req, res) => {
  const target = targetUser(req)
  const links = Array.isArray(req.body?.links) ? req.body.links : []
  res.json({ links: setUserSetting(target.id, 'links', links) })
})

router.put('/tags', requireAuth, (req, res) => {
  const target = targetUser(req)
  const tags = Array.isArray(req.body?.tags) ? req.body.tags : []
  res.json({ tags: setUserSetting(target.id, 'tags', tags) })
})

router.put('/categories', requireAuth, requireAdmin, (req, res) => {
  const raw = Array.isArray(req.body?.categories) ? req.body.categories : []
  const categories = [...new Set(raw.map((c) => String(c).trim()).filter(Boolean))]
  res.json({ categories: setSetting('categories', categories) })
})

router.put('/profile', requireAuth, (req, res) => {
  const target = targetUser(req)
  const { display_name, email, avatar, bio } = req.body || {}
  db.prepare(`UPDATE users SET display_name = ?, email = ?, avatar = ?, bio = ? WHERE id = ?`).run(
    display_name ?? target.display_name,
    email ?? target.email,
    avatar ?? target.avatar,
    bio ?? target.bio,
    target.id
  )
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)
  res.json({ profile: publicUser(user) })
})

// self-service account changes
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
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(nextUsername)) {
      return res.status(400).json({ error: '用户名格式不正确' })
    }
    const exists = db
      .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
      .get(nextUsername, user.id)
    if (exists) return res.status(409).json({ error: '用户名已被占用' })
  }

  db.prepare(`UPDATE users SET username = ?, password_hash = ? WHERE id = ?`).run(
    nextUsername,
    newPassword ? hashPassword(newPassword) : user.password_hash,
    user.id
  )
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
  res.json({ profile: publicUser(updated) })
})

/* ---------------- storage ---------------- */

router.get('/storage', requireAuth, (req, res) => {
  const isAdmin = req.user.role === 'admin'
  const targetId = isAdmin && req.query.userId ? Number(req.query.userId) : req.user.id
  res.json(getStorageOverview({ userId: targetId, isAdmin }))
})

router.post('/storage/clean-orphans', requireAuth, requireAdmin, (req, res) => {
  const result = cleanOrphanUploads()
  res.json({ ...result, storage: getStorageOverview({ isAdmin: true }) })
})

router.post('/storage/vacuum', requireAuth, requireAdmin, (req, res) => {
  const result = vacuumDatabase()
  res.json({ ...result, storage: getStorageOverview({ isAdmin: true }) })
})

router.post('/storage/plugin/:id/clear', requireAuth, requireAdmin, (req, res) => {
  try {
    const owner = req.query.username
      ? db.prepare('SELECT id FROM users WHERE username = ?').get(String(req.query.username))
      : { id: primaryUserId() }
    const result = clearPluginStorage(owner?.id ?? primaryUserId(), req.params.id)
    res.json({ ...result, storage: getStorageOverview({ isAdmin: true }) })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

export default router
