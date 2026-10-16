// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { reactive } from 'vue'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'

interface AuthState {
  user: User | null
  ready: boolean
  setupComplete: boolean | null
}

export const auth = reactive<AuthState>({
  user: null,
  ready: false,
  setupComplete: null,
})

let bootstrapPromise: Promise<void> | null = null

/** The server sets a non-sensitive flag cookie when a session exists. */
function hasSessionCookie(): boolean {
  return document.cookie.split(';').some((c) => c.trim().startsWith('hp_logged_in='))
}

export function isLoggedIn(): boolean {
  return Boolean(auth.user)
}

export function isAdmin(): boolean {
  return auth.user?.role === 'admin' || auth.user?.role === 'super'
}

export function isSuper(): boolean {
  return auth.user?.role === 'super'
}

/** Whether the current user has a capability (admins always do). */
export function can(cap: 'post' | 'moment' | 'plugins'): boolean {
  if (!auth.user) return false
  if (auth.user.role === 'admin' || auth.user.role === 'super') return true
  return Boolean(auth.user.permissions?.[cap])
}

export async function bootstrap(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise
  bootstrapPromise = (async () => {
    try {
      const status = await api<{ setupComplete: boolean }>('/setup/status')
      auth.setupComplete = status.setupComplete
    } catch {
      auth.setupComplete = false
    }
    if (hasSessionCookie()) {
      try {
        const { user } = await api<{ user: User }>('/auth/me')
        auth.user = user
      } catch {
        auth.user = null
      }
    }
    auth.ready = true
  })()
  return bootstrapPromise
}

export function refreshBootstrap() {
  bootstrapPromise = null
  return bootstrap()
}

export async function createSetupAccount(payload: {
  username: string
  password: string
  displayName: string
}) {
  const { user } = await api<{ user: User }>('/setup', { body: payload })
  auth.user = user
  auth.setupComplete = true
  return user
}

export async function login(username: string, password: string) {
  const { user } = await api<{ user: User }>('/auth/login', { body: { username, password } })
  auth.user = user
  return user
}

export function logout() {
  api('/auth/logout', { method: 'POST' }).catch(() => {})
  auth.user = null
}

export function setUser(user: User) {
  auth.user = user
}
