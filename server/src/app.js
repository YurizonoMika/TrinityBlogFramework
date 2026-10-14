// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

import { UPLOAD_DIR } from './db.js'
import setupRoutes from './routes/setup.js'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import postRoutes from './routes/posts.js'
import momentRoutes from './routes/moments.js'
import settingsRoutes from './routes/settings.js'
import cardRoutes from './routes/cards.js'
import activityRoutes from './routes/activity.js'
import nintendoRoutes from './routes/nintendo.js'
import backupRoutes from './routes/backup.js'
import pluginRoutes from './routes/plugins.js'
import uploadRoutes from './routes/uploads.js'
import { PLUGINS_DIR } from './plugins.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createApp() {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '4mb' }))

  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }))
  app.use('/plugins', express.static(PLUGINS_DIR, { maxAge: '1h' }))

  app.use('/api/setup', setupRoutes)
  app.use('/api/auth', authRoutes)
  app.use('/api/users', userRoutes)
  app.use('/api/posts', postRoutes)
  app.use('/api/moments', momentRoutes)
  app.use('/api/settings', settingsRoutes)
  app.use('/api/cards', cardRoutes)
  app.use('/api/activity', activityRoutes)
  app.use('/api/nintendo', nintendoRoutes)
  app.use('/api/backup', backupRoutes)
  app.use('/api/plugins', pluginRoutes)
  app.use('/api/upload', uploadRoutes)

  app.get('/api/health', (req, res) => res.json({ ok: true }))

  const distDir = join(__dirname, '..', '..', 'web', 'dist')
  if (existsSync(distDir)) {
    app.use(express.static(distDir))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next()
      res.sendFile(join(distDir, 'index.html'))
    })
  }

  app.use((err, req, res, next) => {
    console.error(err)
    res.status(500).json({ error: '服务器内部错误' })
  })

  return app
}
