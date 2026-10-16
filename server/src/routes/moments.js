// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import { db, primaryUserId } from '../db.js'
import { requireAuth, can } from '../auth.js'
import { pageUsername } from '../scope.js'

const router = Router()
const MAX_LEN = 200
const MAX_IMAGES = 4

function ownsOrAdmin(user, row) {
  if (!user) return false
  if (user.role === 'admin') return true
  return row.author_id != null && row.author_id === user.id
}

function parseMoment(row) {
  if (!row) return null
  let images = []
  try {
    images = JSON.parse(row.images)
  } catch {
    images = []
  }
  return { ...row, images }
}

function safeImages(images) {
  if (!Array.isArray(images)) return []
  return images.filter((u) => typeof u === 'string' && u).slice(0, MAX_IMAGES)
}

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200)
  const username = (pageUsername(req) || '').trim()
  const authorId = req.query.author_id ? Number(req.query.author_id) : null
  let author = null
  if (username) {
    const u = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (!u) return res.json({ moments: [] })
    author = u.id
  } else if (authorId) {
    author = authorId
  }
  // with no explicit user, the public moments page shows the SITE OWNER's only
  if (author == null) author = primaryUserId()
  const rows = db
    .prepare('SELECT * FROM moments WHERE author_id = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT ?')
    .all(author, limit)
  res.json({ moments: rows.map(parseMoment) })
})

router.post('/', requireAuth, (req, res) => {
  if (!can(req.user, 'moment')) return res.status(403).json({ error: '你没有发动态权限' })
  const content = String(req.body?.content || '').trim()
  const images = safeImages(req.body?.images)
  if (!content && !images.length) {
    return res.status(400).json({ error: '动态内容不能为空' })
  }
  if (content.length > MAX_LEN) {
    return res.status(400).json({ error: `动态最多 ${MAX_LEN} 字` })
  }
  const info = db
    .prepare('INSERT INTO moments (content, images, author_id) VALUES (?, ?, ?)')
    .run(content, JSON.stringify(images), req.user.id)
  const row = db.prepare('SELECT * FROM moments WHERE id = ?').get(info.lastInsertRowid)
  res.status(201).json({ moment: parseMoment(row) })
})

router.put('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM moments WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: '动态不存在' })
  if (!ownsOrAdmin(req.user, existing)) return res.status(403).json({ error: '无权修改该动态' })

  const content = req.body?.content !== undefined ? String(req.body.content).trim() : existing.content
  const images = req.body?.images !== undefined ? safeImages(req.body.images) : parseMoment(existing).images

  if (!content && !images.length) {
    return res.status(400).json({ error: '动态内容不能为空' })
  }
  if (content.length > MAX_LEN) {
    return res.status(400).json({ error: `动态最多 ${MAX_LEN} 字` })
  }

  db.prepare(
    `UPDATE moments SET content = ?, images = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(content, JSON.stringify(images), existing.id)
  const row = db.prepare('SELECT * FROM moments WHERE id = ?').get(existing.id)
  res.json({ moment: parseMoment(row) })
})

router.delete('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM moments WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: '动态不存在' })
  if (!ownsOrAdmin(req.user, existing)) return res.status(403).json({ error: '无权删除该动态' })
  db.prepare('DELETE FROM moments WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
