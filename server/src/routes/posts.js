// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth, isAuthed } from '../auth.js'

const router = Router()

function slugify(input) {
  const base = String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return base || ''
}

function uniqueSlug(desired, excludeId = null) {
  let slug = slugify(desired) || `post-${Date.now()}`
  let candidate = slug
  let i = 2
  for (;;) {
    const row = excludeId
      ? db.prepare('SELECT id FROM posts WHERE slug = ? AND id != ?').get(candidate, excludeId)
      : db.prepare('SELECT id FROM posts WHERE slug = ?').get(candidate)
    if (!row) return candidate
    candidate = `${slug}-${i++}`
  }
}

function parsePost(row) {
  if (!row) return null
  let tags = []
  try {
    tags = JSON.parse(row.tags)
  } catch {
    tags = []
  }
  return { ...row, tags }
}

function safeTags(tags) {
  if (Array.isArray(tags)) return JSON.stringify(tags.filter(Boolean).map(String))
  if (typeof tags === 'string' && tags.trim()) {
    return JSON.stringify(tags.split(',').map((t) => t.trim()).filter(Boolean))
  }
  return '[]'
}

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200)
  const all = req.query.all === '1'
  const category = (req.query.category || '').trim()

  const where = []
  const params = []
  if (!all) where.push("status = 'published'")
  if (category) {
    where.push('category = ?')
    params.push(category)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = db
    .prepare(`SELECT * FROM posts ${clause} ORDER BY datetime(created_at) DESC LIMIT ?`)
    .all(...params, limit)
  res.json({ posts: rows.map(parsePost) })
})

router.get('/:slug', (req, res) => {
  const row = db.prepare('SELECT * FROM posts WHERE slug = ?').get(req.params.slug)
  if (!row) return res.status(404).json({ error: '帖子不存在' })
  if (row.status !== 'published' && !isAuthed(req)) {
    return res.status(404).json({ error: '帖子不存在' })
  }
  if (row.status === 'published') {
    db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(row.id)
    row.views += 1
  }
  res.json({ post: parsePost(row) })
})

router.post('/', requireAuth, (req, res) => {
  const { title, content, summary, cover, status, slug, tags, category } = req.body || {}
  if (!title || !title.trim()) return res.status(400).json({ error: '标题不能为空' })
  const finalSlug = uniqueSlug(slug || title)
  const info = db
    .prepare(
      `INSERT INTO posts (title, slug, summary, content, cover, tags, category, status, author_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      title.trim(),
      finalSlug,
      summary || '',
      content || '',
      cover || '',
      safeTags(tags),
      category || '',
      status === 'hidden' || status === 'draft' ? status : 'published',
      req.user.id
    )
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(info.lastInsertRowid)
  res.status(201).json({ post: parsePost(row) })
})

router.put('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: '帖子不存在' })
  const { title, content, summary, cover, status, slug, tags, category } = req.body || {}
  const finalSlug =
    slug && slugify(slug) !== existing.slug ? uniqueSlug(slug, existing.id) : existing.slug
  db.prepare(
    `UPDATE posts SET title = ?, slug = ?, summary = ?, content = ?, cover = ?,
       tags = ?, category = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(
    title?.trim() || existing.title,
    finalSlug,
    summary ?? existing.summary,
    content ?? existing.content,
    cover ?? existing.cover,
    tags !== undefined ? safeTags(tags) : existing.tags,
    category !== undefined ? category : existing.category,
    status || existing.status,
    existing.id
  )
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(existing.id)
  res.json({ post: parsePost(row) })
})

router.patch('/:id/status', requireAuth, (req, res) => {
  const { status } = req.body || {}
  if (!['published', 'hidden', 'draft'].includes(status)) {
    return res.status(400).json({ error: '无效的状态' })
  }
  const info = db
    .prepare("UPDATE posts SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, req.params.id)
  if (!info.changes) return res.status(404).json({ error: '帖子不存在' })
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id)
  res.json({ post: parsePost(row) })
})

router.delete('/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id)
  if (!info.changes) return res.status(404).json({ error: '帖子不存在' })
  res.json({ ok: true })
})

export default router
