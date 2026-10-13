// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import multer from 'multer'
import AdmZip from 'adm-zip'
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { db, allSettings, setSetting, UPLOAD_DIR } from '../db.js'
import { requireAuth } from '../auth.js'
import { resetCache } from '../nintendo.js'
import { PLUGINS_DIR, loadAllPlugins } from '../plugins.js'

const router = Router()
const APP_ID = 'trinity-blog-framework'
const BACKUP_VERSION = 1

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 },
})

router.use(requireAuth)

router.get('/export', (req, res) => {
  const settings = allSettings()
  delete settings._jwt_secret // keep each site's own session secret

  const backup = {
    app: APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      settings,
      users: db.prepare('SELECT * FROM users ORDER BY id').all(),
      posts: db.prepare('SELECT * FROM posts ORDER BY id').all(),
      moments: db.prepare('SELECT * FROM moments ORDER BY id').all(),
      cards: db.prepare('SELECT * FROM cards ORDER BY position').all(),
    },
  }

  const zip = new AdmZip()
  zip.addFile('data.json', Buffer.from(JSON.stringify(backup, null, 2), 'utf-8'))

  for (const file of readdirSync(UPLOAD_DIR)) {
    try {
      zip.addLocalFile(join(UPLOAD_DIR, file), 'uploads')
    } catch {
      /* skip unreadable files */
    }
  }

  // plugin packages
  function addPlugins(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) addPlugins(full)
      else {
        const rel = relative(PLUGINS_DIR, full)
        try {
          zip.addFile(`plugins/${rel}`, readFileSync(full))
        } catch {
          /* skip */
        }
      }
    }
  }
  try {
    if (readdirSync(PLUGINS_DIR).length) addPlugins(PLUGINS_DIR)
  } catch {
    /* no plugins */
  }

  const filename = `trinity-backup-${new Date().toISOString().slice(0, 10)}.zip`
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(zip.toBuffer())
})

router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有收到文件' })

  let zip
  try {
    zip = new AdmZip(req.file.buffer)
  } catch {
    return res.status(400).json({ error: '无效的 zip 文件' })
  }

  const entry = zip.getEntry('data.json')
  if (!entry) return res.status(400).json({ error: '压缩包内缺少 data.json' })

  let backup
  try {
    backup = JSON.parse(entry.getData().toString('utf-8'))
  } catch {
    return res.status(400).json({ error: 'data.json 解析失败' })
  }
  if (!backup || backup.app !== APP_ID || !backup.data) {
    return res.status(400).json({ error: '不是本软件的备份文件' })
  }

  const { settings = {}, users = [], posts = [], moments = [], cards = [] } = backup.data

  try {
    db.exec('BEGIN')
    db.exec('DELETE FROM moments')
    db.exec('DELETE FROM posts')
    db.exec('DELETE FROM cards')
    db.exec("DELETE FROM settings WHERE key != '_jwt_secret'")
    db.exec('DELETE FROM users')

    for (const [key, value] of Object.entries(settings)) {
      if (key === '_jwt_secret') continue
      setSetting(key, value)
    }

    const insUser = db.prepare(
      `INSERT INTO users (id, username, password_hash, display_name, email, avatar, bio, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const u of users) {
      insUser.run(
        u.id,
        u.username,
        u.password_hash,
        u.display_name || '',
        u.email || '',
        u.avatar || '',
        u.bio || '',
        u.created_at || new Date().toISOString()
      )
    }

    const insPost = db.prepare(
      `INSERT INTO posts (id, title, slug, summary, content, cover, tags, category, status, author_id, views, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const p of posts) {
      insPost.run(
        p.id,
        p.title,
        p.slug,
        p.summary || '',
        p.content || '',
        p.cover || '',
        p.tags || '[]',
        p.category || '',
        p.status || 'published',
        p.author_id ?? null,
        p.views || 0,
        p.created_at || new Date().toISOString(),
        p.updated_at || new Date().toISOString()
      )
    }

    const insMoment = db.prepare(
      `INSERT INTO moments (id, content, images, author_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    for (const m of moments) {
      insMoment.run(
        m.id,
        m.content || '',
        m.images || '[]',
        m.author_id ?? null,
        m.created_at || new Date().toISOString(),
        m.updated_at || new Date().toISOString()
      )
    }

    const insCard = db.prepare(
      `INSERT INTO cards (id, type, title, config, position, width, visible, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const c of cards) {
      insCard.run(
        c.id,
        c.type,
        c.title || '',
        c.config || '{}',
        c.position || 0,
        c.width || 'half',
        c.visible ? 1 : 0,
        c.created_at || new Date().toISOString(),
        c.updated_at || new Date().toISOString()
      )
    }

    db.exec('COMMIT')
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* ignore */
    }
    return res.status(500).json({ error: '导入失败：' + String(err.message || err) })
  }

  // Restore uploaded files
  let files = 0
  for (const item of zip.getEntries()) {
    if (item.isDirectory) continue
    if (!item.entryName.startsWith('uploads/')) continue
    const name = item.entryName.slice('uploads/'.length)
    if (!name || name.includes('/') || name.includes('..')) continue
    try {
      writeFileSync(join(UPLOAD_DIR, name), item.getData())
      files++
    } catch {
      /* skip */
    }
  }

  // Restore plugin packages
  let pluginFiles = 0
  for (const item of zip.getEntries()) {
    if (item.isDirectory) continue
    if (!item.entryName.startsWith('plugins/')) continue
    const name = item.entryName.slice('plugins/'.length)
    if (!name || name.includes('..')) continue
    try {
      const target = join(PLUGINS_DIR, name)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, item.getData())
      pluginFiles++
    } catch {
      /* skip */
    }
  }

  resetCache()
  loadAllPlugins()

  res.json({
    ok: true,
    counts: {
      users: users.length,
      posts: posts.length,
      moments: moments.length,
      cards: cards.length,
      files,
      plugins: pluginFiles,
    },
  })
})

export default router
