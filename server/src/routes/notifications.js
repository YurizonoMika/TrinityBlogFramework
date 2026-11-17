// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import { requireAuth, requireAdmin, sessionUser } from '../auth.js'
import {
  createNotification,
  getNotificationMutes,
  listUnreadNotifications,
  markNotificationRead,
  notificationVisibleTo,
  setNotificationMutes,
} from '../notifications.js'

const router = Router()

// Pull notifications for this page load. Anonymous visitors get visitor + all;
// signed-in users get their own + all. No polling endpoint is needed.
router.get('/', (req, res) => {
  const viewer = sessionUser(req)
  res.json({ notifications: listUnreadNotifications(viewer ? viewer.id : null) })
})

// Admin/system notifications. Plugin-owned notifications normally go through
// plugin.notify() in the sandbox, but this endpoint is useful for integrations.
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const body = req.body || {}
  try {
    const result = createNotification({
      pluginId: body.pluginId,
      ownerId: req.user.id,
      audience: body.audience,
      userIds: body.userIds,
      icon: body.icon,
      title: body.title,
      content: body.content,
      actions: body.actions,
    })
    res.status(201).json({ ok: true, ids: result.ids })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

router.get('/settings', requireAuth, (req, res) => {
  res.json({ muted: getNotificationMutes(req.user.id) })
})

router.put('/settings', requireAuth, (req, res) => {
  res.json({ muted: setNotificationMutes(req.user.id, req.body?.muted) })
})

router.post('/:id/read', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '无效的通知 id' })
  const viewer = sessionUser(req)
  // Anonymous read state is kept in localStorage by the client.
  if (!viewer) return res.json({ ok: true })
  if (!notificationVisibleTo(id, viewer.id)) return res.status(404).json({ error: '通知不存在' })
  markNotificationRead(id, viewer.id)
  res.json({ ok: true })
})

export default router
