// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import crypto from 'node:crypto'
import { db, primaryUserId } from '../db.js'
import { requireAuth, isAdminUser } from '../auth.js'
import { pageUsername } from '../scope.js'

const router = Router()

function parseCard(row) {
  if (!row) return null
  let config = {}
  try {
    config = JSON.parse(row.config)
  } catch {
    config = {}
  }
  return { ...row, config, visible: Boolean(row.visible) }
}

const CARD_TYPES = ['profile', 'activity', 'posts', 'markdown', 'links', 'plugin', 'plugin-widget']

// plugin widgets register as their own card types: plugin:<pluginId>:<widgetId>
function isValidCardType(type) {
  return CARD_TYPES.includes(type) || /^plugin:[\w-]+:[\w-]+$/.test(String(type))
}

/** Which user's cards this request targets (admins may manage any user). */
function targetUserId(req) {
  if (isAdminUser(req.user) && req.query.userId) return Number(req.query.userId)
  return req.user ? req.user.id : primaryUserId()
}

// public: a user's cards (defaults to the site owner)
router.get('/', (req, res) => {
  let userId
  const username = pageUsername(req)
  if (username) {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(String(username))
    if (!user) return res.json({ cards: [] })
    userId = user.id
  } else {
    userId = primaryUserId()
  }
  const rows = db.prepare('SELECT * FROM cards WHERE user_id = ? ORDER BY position ASC').all(userId)
  res.json({ cards: rows.map(parseCard) })
})

router.post('/', requireAuth, (req, res) => {
  const { type, title, width, config } = req.body || {}
  if (!isValidCardType(type)) {
    return res.status(400).json({ error: '无效的卡片类型' })
  }
  const userId = targetUserId(req)
  const id = crypto.randomUUID()
  const maxRow = db.prepare('SELECT MAX(position) AS m FROM cards WHERE user_id = ?').get(userId)
  const position = (maxRow.m ?? -1) + 1
  db.prepare(
    `INSERT INTO cards (id, user_id, type, title, config, position, width, visible)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(id, userId, type, title || '', JSON.stringify(config || {}), position, width === 'full' ? 'full' : 'half')
  const row = db.prepare('SELECT * FROM cards WHERE id = ?').get(id)
  res.status(201).json({ card: parseCard(row) })
})

router.put('/reorder', requireAuth, (req, res) => {
  const userId = targetUserId(req)
  const order = Array.isArray(req.body?.order) ? req.body.order : []
  const owned = db.prepare('SELECT id FROM cards WHERE user_id = ?').all(userId).map((r) => r.id)
  const ranked = [
    ...order.filter((id) => owned.includes(id)),
    ...owned.filter((id) => !order.includes(id)),
  ]
  const update = db.prepare(
    "UPDATE cards SET position = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  )
  ranked.forEach((id, index) => update.run(index, id, userId))
  const rows = db.prepare('SELECT * FROM cards WHERE user_id = ? ORDER BY position ASC').all(userId)
  res.json({ cards: rows.map(parseCard) })
})

router.put('/:id', requireAuth, (req, res) => {
  const userId = targetUserId(req)
  const existing = db.prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?').get(req.params.id, userId)
  if (!existing) return res.status(404).json({ error: '卡片不存在' })
  const { title, width, config, visible } = req.body || {}
  db.prepare(
    `UPDATE cards SET title = ?, width = ?, config = ?, visible = ?,
       updated_at = datetime('now') WHERE id = ?`
  ).run(
    title ?? existing.title,
    width ?? existing.width,
    config !== undefined ? JSON.stringify(config) : existing.config,
    visible !== undefined ? (visible ? 1 : 0) : existing.visible,
    existing.id
  )
  const row = db.prepare('SELECT * FROM cards WHERE id = ?').get(existing.id)
  res.json({ card: parseCard(row) })
})

router.delete('/:id', requireAuth, (req, res) => {
  const userId = targetUserId(req)
  const info = db.prepare('DELETE FROM cards WHERE id = ? AND user_id = ?').run(req.params.id, userId)
  if (!info.changes) return res.status(404).json({ error: '卡片不存在' })
  res.json({ ok: true })
})

export default router
