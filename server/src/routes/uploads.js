// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { UPLOAD_DIR } from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'])

const storage = multer.diskStorage({
  // uploads are namespaced per user: uploads/users/<id>/<name>
  destination: (req, file, cb) => {
    const dir = join(UPLOAD_DIR, 'users', String(req.user.id))
    mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase()
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase()
    if (!ALLOWED.has(ext)) {
      return cb(new Error('不支持的文件类型'))
    }
    cb(null, true)
  },
})

router.post('/', requireAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message })
    if (!req.file) return res.status(400).json({ error: '没有收到文件' })
    res.status(201).json({
      url: `/uploads/users/${req.user.id}/${req.file.filename}`,
      name: req.file.originalname,
      size: req.file.size,
    })
  })
})

export default router
