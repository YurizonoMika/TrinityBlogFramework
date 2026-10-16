// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import { db, primaryUserId } from '../db.js'
import { requireAuth, can, sessionUser, isAdminUser } from '../auth.js'
import { pageUsername } from '../scope.js'

const router = Router()

function ownsOrAdmin(user, row) {
  if (!user) return false
  if (isAdminUser(user)) return true
  return row.author_id != null && row.author_id === user.id
}

function slugify(input) {
  const base = String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return base || ''
}

/** Resolve the (optional) viewer of a public route from cookie or Bearer token. */
function viewer(req) {
  return sessionUser(req)
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
  const me = viewer(req)
  // `all=1` is admin-only — regular users may only list their *own* drafts
  const seeAll = req.query.all === '1' && isAdminUser(me)
  const selfOnly = Boolean(me) && !seeAll
  const category = (req.query.category || '').trim()

  const where = []
  const params = []
  if (!seeAll) {
    if (selfOnly) where.push(`(p.status = 'published' OR p.author_id = ?)`), params.push(me.id)
    else where.push("p.status = 'published'")
  }
  if (category) {
    where.push('p.category = ?')
    params.push(category)
  }
  // filter by a specific author (used by /user/:username and admin management)
  const username = (pageUsername(req) || '').trim()
  const authorId = req.query.author_id ? Number(req.query.author_id) : null
  let author = null
  if (username) {
    const u = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (!u) return res.json({ posts: [] })
    author = u.id
  } else if (authorId) {
    author = authorId
  }
  // with no explicit user, the public blog shows the SITE OWNER's posts only
  // (admins listing everything must pass `?all=1` with no username)
  if (author == null && !seeAll) author = primaryUserId()
  if (author != null) {
    where.push('p.author_id = ?')
    params.push(author)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `SELECT p.*, u.display_name AS author_name, u.username AS author_username, u.avatar AS author_avatar
       FROM posts p LEFT JOIN users u ON u.id = p.author_id
       ${clause} ORDER BY datetime(p.created_at) DESC LIMIT ?`
    )
    .all(...params, limit)
  res.json({ posts: rows.map(parsePost) })
})

const POST_SELECT = `SELECT p.*, u.display_name AS author_name, u.username AS author_username, u.avatar AS author_avatar
   FROM posts p LEFT JOIN users u ON u.id = p.author_id`

router.get('/:slug', (req, res) => {
  const row = db.prepare(`${POST_SELECT} WHERE p.slug = ?`).get(req.params.slug)
  if (!row) return res.status(404).json({ error: '帖子不存在' })
  // drafts / hidden posts are visible to their author and admins only
  if (row.status !== 'published') {
    const me = viewer(req)
    const allowed = isAdminUser(me) || (me && me.id === row.author_id)
    if (!allowed) return res.status(404).json({ error: '帖子不存在' })
  }
  if (row.status === 'published') {
    db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(row.id)
    row.views += 1
  }
  res.json({ post: parsePost(row) })
})

router.post('/', requireAuth, (req, res) => {
  if (!can(req.user, 'post')) return res.status(403).json({ error: '你没有发帖权限' })
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
  if (!ownsOrAdmin(req.user, existing)) return res.status(403).json({ error: '无权修改该帖子' })
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
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: '帖子不存在' })
  if (!ownsOrAdmin(req.user, existing)) return res.status(403).json({ error: '无权修改该帖子' })
  const info = db
    .prepare("UPDATE posts SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, req.params.id)
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id)
  res.json({ post: parsePost(row) })
})

router.delete('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: '帖子不存在' })
  if (!ownsOrAdmin(req.user, existing)) return res.status(403).json({ error: '无权删除该帖子' })
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
