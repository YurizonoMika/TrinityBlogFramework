// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { reactive } from 'vue'
import { api, getToken, setToken } from '@/lib/api'
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

export function isLoggedIn(): boolean {
  return Boolean(auth.user)
}

export function isAdmin(): boolean {
  return auth.user?.role === 'admin'
}

/** Whether the current user has a capability (admins always do). */
export function can(cap: 'post' | 'moment' | 'plugins'): boolean {
  if (!auth.user) return false
  if (auth.user.role === 'admin') return true
  return Boolean(auth.user.permissions?.[cap])
}

export async function bootstrap(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise
  bootstrapPromise = (async () => {
    try {
      const status = await api<{ setupComplete: boolean }>('/setup/status', { auth: false })
      auth.setupComplete = status.setupComplete
    } catch {
      auth.setupComplete = false
    }
    if (getToken()) {
      try {
        const { user } = await api<{ user: User }>('/auth/me')
        auth.user = user
      } catch {
        setToken(null)
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
  const { token, user } = await api<{ token: string; user: User }>('/setup', {
    body: payload,
    auth: false,
  })
  setToken(token)
  auth.user = user
  auth.setupComplete = true
  return user
}

export async function login(username: string, password: string) {
  const { token, user } = await api<{ token: string; user: User }>('/auth/login', {
    body: { username, password },
    auth: false,
  })
  setToken(token)
  auth.user = user
  return user
}

export function logout() {
  setToken(null)
  auth.user = null
}

export function setUser(user: User) {
  auth.user = user
}
