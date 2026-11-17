// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { db, getUserSetting, setUserSetting } from './db.js'

const AUDIENCES = new Set(['visitor', 'user', 'all'])
const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]*$/
const MAX_TITLE = 120
const MAX_CONTENT = 2000
const MAX_ICON = 200
const MAX_LINK_ACTIONS = 4

function text(value, max) {
  return String(value == null ? '' : value).slice(0, max)
}

function safeLink(url) {
  const value = text(url, 500).trim()
  if (!value) return ''
  if (/^\/(?!\/)/.test(value)) return value
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : ''
  } catch {
    return ''
  }
}

function safeIcon(icon) {
  const value = text(icon, MAX_ICON).trim()
  if (!value) return ''
  if (/^(https?:\/\/|\/(?!\/))/.test(value)) return value
  return /^[a-z0-9_]+$/i.test(value) ? value : ''
}

function normalizeActions(actions) {
  const out = []
  for (const item of Array.isArray(actions) ? actions : []) {
    if (out.length >= MAX_LINK_ACTIONS) break
    if (!item || typeof item !== 'object') continue
    if (item.kind === 'ack') continue // the standard acknowledgement is always appended
    const label = text(item.label, 24).trim()
    if (!label) continue
    if (item.kind === 'action') {
      const topic = text(item.topic, 64).trim()
      if (/^[a-z0-9:_-]{1,64}$/i.test(topic)) {
        out.push({ id: `a${out.length + 1}`, label, kind: 'action', topic })
      }
      continue
    }
    const url = safeLink(item.url)
    if (!url) continue
    out.push({ id: `a${out.length + 1}`, label, kind: 'link', url })
  }
  out.push({ id: 'ack', label: '我知道了', kind: 'ack' })
  return out
}

function resolveUsers(userIds) {
  const ids = []
  const seen = new Set()
  for (const value of Array.isArray(userIds) ? userIds : [userIds]) {
    if (value == null || value === '') continue
    const row =
      typeof value === 'number' || /^\d+$/.test(String(value))
        ? db.prepare('SELECT id FROM users WHERE id = ?').get(Number(value))
        : db.prepare('SELECT id FROM users WHERE username = ?').get(String(value))
    if (row && !seen.has(row.id)) {
      seen.add(row.id)
      ids.push(row.id)
    }
  }
  return ids
}

export function createNotification({
  pluginId = '',
  ownerId = null,
  audience = 'user',
  userIds = [],
  icon = '',
  title,
  content = '',
  actions = [],
}) {
  const plugin = text(pluginId, 80).trim()
  if (plugin && !PLUGIN_ID_RE.test(plugin)) throw new Error('无效的插件 id')
  const cleanTitle = text(title, MAX_TITLE).trim()
  if (!cleanTitle) throw new Error('通知标题不能为空')
  const cleanContent = text(content, MAX_CONTENT)
  const cleanIcon = safeIcon(icon)
  const cleanActions = normalizeActions(actions)
  const targetAudience = AUDIENCES.has(audience) ? audience : 'user'
  const targets = targetAudience === 'user' ? resolveUsers(userIds) : [null]
  if (targetAudience === 'user' && !targets.length) {
    throw new Error('没有有效的通知接收者')
  }

  const insert = db.prepare(
    `INSERT INTO notifications
       (plugin_id, owner_id, audience, user_id, icon, title, content, actions, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
  const ids = []
  for (const userId of targets) {
    const result = insert.run(
      plugin,
      ownerId == null ? null : Number(ownerId),
      targetAudience,
      userId,
      cleanIcon,
      cleanTitle,
      cleanContent,
      JSON.stringify(cleanActions)
    )
    ids.push(Number(result.lastInsertRowid))
  }
  return { ids, actions: cleanActions }
}

/** Plugin-facing send with audience guards. Non-admin plugin owners may only
 *  notify themselves; broad audiences are reserved for admin-owned plugins. */
export function sendPluginNotification(ownerId, pluginId, payload = {}) {
  const owner = db.prepare('SELECT id, role FROM users WHERE id = ?').get(ownerId)
  if (!owner) throw new Error('插件所有者不存在')
  const admin = owner.role === 'admin' || owner.role === 'super'
  const audience = payload.audience === 'visitor' || payload.audience === 'all'
    ? payload.audience
    : 'user'
  if (!admin && audience !== 'user') {
    throw new Error('仅管理员插件可以发送全站/访客通知')
  }
  const userIds = admin ? payload.userIds : [ownerId]
  return createNotification({
    pluginId,
    ownerId,
    audience,
    userIds,
    icon: payload.icon,
    title: payload.title,
    content: payload.content,
    actions: payload.actions,
  })
}

function publicNotification(row) {
  let actions = []
  try {
    actions = JSON.parse(row.actions || '[]')
  } catch {
    actions = []
  }
  return {
    id: Number(row.id),
    pluginId: row.plugin_id || '',
    icon: row.icon || '',
    title: row.title || '',
    content: row.content || '',
    actions: Array.isArray(actions) ? actions : [],
    audience: row.audience || 'user',
    createdAt: row.created_at || '',
  }
}

export function getNotificationMutes(userId) {
  const raw = getUserSetting(userId, 'notification_mutes', [])
  return Array.isArray(raw)
    ? [...new Set(raw.map(String).filter((id) => PLUGIN_ID_RE.test(id)))].slice(0, 200)
    : []
}

export function setNotificationMutes(userId, list) {
  const clean = Array.isArray(list)
    ? [...new Set(list.map(String).filter((id) => PLUGIN_ID_RE.test(id)))].slice(0, 200)
    : []
  setUserSetting(userId, 'notification_mutes', clean)
  return clean
}

/** Unread notifications visible to this viewer (null = anonymous visitor). */
export function listUnreadNotifications(viewerId = null) {
  let rows
  if (viewerId != null) {
    rows = db
      .prepare(
        `SELECT n.* FROM notifications n
         WHERE (n.audience = 'all' OR (n.audience = 'user' AND n.user_id = ?))
           AND NOT EXISTS (
             SELECT 1 FROM notification_reads r
             WHERE r.notification_id = n.id AND r.user_id = ?
           )
         ORDER BY n.id DESC
         LIMIT 100`
      )
      .all(viewerId, viewerId)
  } else {
    rows = db
      .prepare(
        `SELECT * FROM notifications
         WHERE audience IN ('visitor', 'all')
         ORDER BY id DESC
         LIMIT 100`
      )
      .all()
  }
  const muted = viewerId != null ? new Set(getNotificationMutes(viewerId)) : new Set()
  return rows
    .filter((row) => !row.plugin_id || !muted.has(row.plugin_id))
    .map(publicNotification)
}

export function notificationVisibleTo(id, viewerId) {
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id)
  if (!row) return false
  if (viewerId != null) {
    return row.audience === 'all' || (row.audience === 'user' && row.user_id === viewerId)
  }
  return row.audience === 'visitor' || row.audience === 'all'
}

export function markNotificationRead(id, viewerId) {
  if (viewerId == null || !notificationVisibleTo(id, viewerId)) return false
  db.prepare(
    `INSERT INTO notification_reads (notification_id, user_id, read_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(notification_id, user_id) DO NOTHING`
  ).run(id, viewerId)
  return true
}
