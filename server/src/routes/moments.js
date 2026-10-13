// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()
const MAX_LEN = 200
const MAX_IMAGES = 4

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
  const rows = db
    .prepare('SELECT * FROM moments ORDER BY datetime(created_at) DESC, id DESC LIMIT ?')
    .all(limit)
  res.json({ moments: rows.map(parseMoment) })
})

router.post('/', requireAuth, (req, res) => {
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
  const info = db.prepare('DELETE FROM moments WHERE id = ?').run(req.params.id)
  if (!info.changes) return res.status(404).json({ error: '动态不存在' })
  res.json({ ok: true })
})

export default router
