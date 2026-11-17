// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { computed, reactive } from 'vue'
import { api } from '@/lib/api'
import { auth } from './auth'

export interface NotificationAction {
  id: string
  label: string
  kind: 'ack' | 'link' | 'action'
  url?: string
  /** client-handled action name, dispatched as homepage:notification-action */
  topic?: string
}

export interface AppNotification {
  id: number
  pluginId: string
  icon: string
  title: string
  content: string
  actions: NotificationAction[]
  audience: 'visitor' | 'user' | 'all'
  createdAt: string
  /** client-only notification (not persisted by the server) */
  local?: boolean
  localKey?: string
}

const BANNER_PREFIX = 'homepage.notifications.bannered.'
const GUEST_READ_KEY = 'homepage.notifications.read.guest'

function scopeKey() {
  return auth.user ? `u${auth.user.id}` : 'guest'
}

function readNumberList(key: string): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []
  } catch {
    return []
  }
}

function writeNumberList(key: string, values: number[]) {
  try {
    localStorage.setItem(key, JSON.stringify([...new Set(values)].slice(-300)))
  } catch {
    /* storage can be unavailable */
  }
}

export const notifications = reactive({
  items: [] as AppNotification[],
  loaded: false,
  panelOpen: false,
  banner: null as AppNotification | null,
  queue: [] as AppNotification[],
})

export const unreadCount = computed(() => notifications.items.length)

let loadToken = 0
let localSeq = 0

function banneredKey() {
  return BANNER_PREFIX + scopeKey()
}

function banneredIds(): Set<number> {
  return new Set(readNumberList(banneredKey()))
}

function rememberBannered(ids: number[]) {
  const set = banneredIds()
  for (const id of ids) set.add(id)
  writeNumberList(banneredKey(), [...set])
}

function nextBanner() {
  while (!notifications.banner && notifications.queue.length) {
    const next = notifications.queue.shift()!
    if (notifications.items.some((n) => n.id === next.id)) {
      notifications.banner = next
      return
    }
  }
}

function queueBanners(items: AppNotification[]) {
  const seen = banneredIds()
  const fresh = items.filter((n) => !seen.has(n.id))
  if (!fresh.length) return
  rememberBannered(fresh.map((n) => n.id))
  notifications.queue.push(...fresh)
  nextBanner()
}

/** Fetch once per page load (and once after an auth identity change). */
export async function loadNotifications() {
  const token = ++loadToken
  const guest = !auth.user
  dismissAllBanners()
  notifications.items = []
  notifications.loaded = false
  try {
    const res = await api<{ notifications: AppNotification[] }>('/notifications')
    if (token !== loadToken) return
    let items = Array.isArray(res.notifications) ? res.notifications : []
    if (guest) {
      const read = new Set(readNumberList(GUEST_READ_KEY))
      items = items.filter((n) => !read.has(n.id))
    }
    notifications.items = items
    notifications.loaded = true
    queueBanners(items)
  } catch {
    if (token !== loadToken) return
    notifications.loaded = true
  }
}

export function dismissBanner(id?: number) {
  if (!notifications.banner) return
  if (id != null && notifications.banner.id !== id) return
  notifications.banner = null
  nextBanner()
}

export function dismissAllBanners() {
  notifications.banner = null
  notifications.queue = []
}

export function openPanel() {
  notifications.panelOpen = true
  dismissAllBanners()
}

export function closePanel() {
  notifications.panelOpen = false
}

export function togglePanel() {
  if (notifications.panelOpen) closePanel()
  else openPanel()
}

export async function markNotificationRead(id: number) {
  const item = notifications.items.find((n) => n.id === id)
  if (!item) return
  notifications.items = notifications.items.filter((n) => n.id !== id)
  notifications.queue = notifications.queue.filter((n) => n.id !== id)
  if (notifications.banner?.id === id) {
    notifications.banner = null
    nextBanner()
  }
  // Local notifications only exist in this browser; never send them to the API.
  if (item.local) return
  if (!auth.user) {
    const read = readNumberList(GUEST_READ_KEY)
    if (!read.includes(id)) {
      read.push(id)
      writeNumberList(GUEST_READ_KEY, read)
    }
    return
  }
  try {
    await api(`/notifications/${id}/read`, { method: 'POST' })
  } catch {
    /* optimistic removal; the next page load is authoritative */
  }
}

function localActions(actions: NotificationAction[]) {
  const out: NotificationAction[] = []
  for (const action of Array.isArray(actions) ? actions : []) {
    if (!action || typeof action !== 'object') continue
    const label = String(action.label || '').trim().slice(0, 24)
    if (!label) continue
    if (action.kind === 'link' && /^(\/(?!\/)|https?:\/\/)/.test(String(action.url || ''))) {
      out.push({ id: `a${out.length + 1}`, label, kind: 'link', url: String(action.url).slice(0, 500) })
    } else if (action.kind === 'action' && /^[a-z0-9:_-]{1,64}$/i.test(String(action.topic || ''))) {
      out.push({ id: `a${out.length + 1}`, label, kind: 'action', topic: String(action.topic) })
    }
    if (out.length >= 4) break
  }
  out.push({ id: 'ack', label: '我知道了', kind: 'ack' })
  return out
}

/** Add a notification that only exists in this browser (client-detected events). */
export function pushLocalNotification(input: {
  pluginId?: string
  key?: string
  icon?: string
  title: string
  content?: string
  actions?: NotificationAction[]
}) {
  const title = String(input?.title || '').trim().slice(0, 120)
  if (!title) return
  const key = String(input?.key || '').slice(0, 80)
  if (key && notifications.items.some((n) => n.local && n.localKey === key)) return
  const item: AppNotification = {
    id: --localSeq,
    pluginId: String(input?.pluginId || ''),
    icon: String(input?.icon || 'notifications').slice(0, 200),
    title,
    content: String(input?.content || '').slice(0, 2000),
    actions: localActions(input?.actions || []),
    audience: 'user',
    createdAt: new Date().toISOString(),
    local: true,
    localKey: key,
  }
  notifications.items = [item, ...notifications.items]
  notifications.queue.push(item)
  nextBanner()
}

export function removePluginNotifications(pluginId: string) {
  notifications.items = notifications.items.filter((n) => n.pluginId !== pluginId)
  notifications.queue = notifications.queue.filter((n) => n.pluginId !== pluginId)
  if (notifications.banner?.pluginId === pluginId) {
    notifications.banner = null
    nextBanner()
  }
}

export function resetNotifications() {
  loadToken++
  notifications.items = []
  notifications.loaded = false
  notifications.panelOpen = false
  notifications.banner = null
  notifications.queue = []
}
