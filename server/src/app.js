// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

import { UPLOAD_DIR, getSetting } from './db.js'
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
import themeRoutes from './routes/themes.js'
import uploadRoutes from './routes/uploads.js'
import { PLUGINS_DIR } from './plugins.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Strict CSP for the SPA: scripts only from our own origin and no client-side
// requests to third parties (plugins must proxy external calls via the server).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "connect-src 'self'",
  "frame-src https: http:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ')

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', true)
  app.use(express.json({ limit: '4mb' }))

  // baseline security headers for every response
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('Content-Security-Policy', CSP)
    next()
  })

  // CSRF guard: state-changing API calls must come from the app (custom header)
  // or authenticate with a Bearer token (API clients).
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
    if ((req.headers.authorization || '').startsWith('Bearer ')) return next()
    if (req.get('x-requested-with') === 'XMLHttpRequest') return next()
    return res.status(403).json({ error: '请求被拒绝（缺少 CSRF 标记）' })
  })

  app.use(
    '/uploads',
    // uploaded images (incl. SVG) must never execute scripts when opened directly
    (req, res, next) => {
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      res.setHeader('X-Content-Type-Options', 'nosniff')
      next()
    },
    express.static(UPLOAD_DIR, { maxAge: '7d' })
  )
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
  app.use('/api/themes', themeRoutes)
  app.use('/api/upload', uploadRoutes)

  app.get('/api/health', (req, res) => res.json({ ok: true }))

  const distDir = join(__dirname, '..', '..', 'web', 'dist')
  if (existsSync(distDir)) {
    // Transparent icon used when the owner hasn't uploaded a logo.
    const BLANK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"/>'
    const BLANK_ICON = `data:image/svg+xml,${encodeURIComponent(BLANK_SVG)}`
    // The site owner's icon setting (global), e.g. /uploads/users/1/xxxx.png
    const siteIcon = () => String(getSetting('site', {}).icon || '')
    // Resolve the icon setting to an on-disk file (path-traversal guarded).
    const iconFile = () => {
      const icon = siteIcon()
      if (!icon || !icon.startsWith('/uploads/')) return null
      const rel = icon.slice('/uploads/'.length)
      if (!rel || rel.includes('..')) return null
      const p = join(UPLOAD_DIR, rel)
      return existsSync(p) ? p : null
    }
    const iconType = (href) =>
      href.includes('.png') ? 'image/png'
      : href.includes('.jpg') || href.includes('.jpeg') ? 'image/jpeg'
      : href.includes('.webp') ? 'image/webp'
      : href.includes('.gif') ? 'image/gif'
      : 'image/svg+xml'

    // Serve the current icon at the classic favicon paths. Old cached HTML and
    // browsers' automatic /favicon.ico requests point here, so this guarantees
    // the right icon even if a browser still holds the previous page shell.
    // Registered BEFORE the static middleware so it wins over the placeholder.
    app.get(['/favicon.ico', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png'], (req, res) => {
      res.set('Cache-Control', 'no-cache')
      const file = iconFile()
      if (file) return res.sendFile(file)
      res.type('image/svg+xml').send(BLANK_SVG)
    })

    // Read the shell once; the favicon link is injected per request so the
    // browser gets the right icon at parse time (history/bookmarks capture the
    // favicon on load, and Safari ignores late JS-set icons).
    let indexTemplate = ''
    try {
      indexTemplate = readFileSync(join(distDir, 'index.html'), 'utf8')
    } catch {
      indexTemplate = ''
    }
    const renderIndex = () => {
      const icon = siteIcon()
      const href = icon || BLANK_ICON
      const type = icon ? iconType(icon) : 'image/svg+xml'
      const links =
        `<link rel="icon" href="${href}" type="${type}" />\n` +
        `    <link rel="apple-touch-icon" href="${href}" />`
      return indexTemplate.replace(/<link rel="icon"[^>]*>/, links)
    }
    const sendIndex = (res) => {
      if (!indexTemplate) return res.sendFile(join(distDir, 'index.html'))
      res.set('Cache-Control', 'no-cache')
      res.type('html').send(renderIndex())
    }
    // `/` and `/index.html` go through the injector (registered before the
    // static middleware so they take precedence)
    app.get(['/', '/index.html'], (req, res) => sendIndex(res))
    // serve assets (hashed js/css, images) but never the raw index.html
    app.use(express.static(distDir, { index: false }))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next()
      sendIndex(res)
    })
  }

  app.use((err, req, res, next) => {
    console.error(err)
    res.status(500).json({ error: '服务器内部错误' })
  })

  return app
}
