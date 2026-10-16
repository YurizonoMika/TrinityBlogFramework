// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import multer from 'multer'
import { requireAuth, requireAdmin } from '../auth.js'
import { listThemes, inspectTheme, importTheme, deleteTheme, themeForUser, themeAssetPath } from '../themes.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } })

// the theme library (public — needed to pick a theme)
router.get('/', (req, res) => {
  res.json({ themes: listThemes() })
})

// the theme applied by a page owner (public — visitors render that page's theme)
router.get('/active', (req, res) => {
  res.json(themeForUser(req.query.username || ''))
})

// theme assets: theme.css / theme.html / images / fonts (public, same-origin)
router.get('/:id/asset/*', (req, res) => {
  const p = themeAssetPath(req.params.id, req.params[0])
  if (!p) return res.status(404).end()
  res.sendFile(p)
})

// importing / removing themes is admin-only
router.post('/inspect', requireAuth, requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有收到文件' })
  try {
    res.json({ theme: inspectTheme(req.file.buffer) })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

router.post('/import', requireAuth, requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有收到文件' })
  try {
    res.status(201).json({ theme: importTheme(req.file.buffer) })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    deleteTheme(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

export default router
