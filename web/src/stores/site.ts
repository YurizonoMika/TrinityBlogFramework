// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { reactive, watch } from 'vue'
import { api } from '@/lib/api'
import {
  applyDynamicVars,
  clearDynamicTheme,
  hasDynamicTheme,
  loadDynamicThemeFromHex,
  loadDynamicThemeFromImage,
} from '@/lib/dynamicTheme'
import type {
  HomepageSettings,
  Integrations,
  LinkItem,
  ProfileTag,
  PublicProfile,
  SiteSettings,
} from '@/lib/types'

interface SiteState {
  site: SiteSettings
  profile: PublicProfile | null
  homepage: HomepageSettings
  integrations: Integrations
  categories: string[]
  theme: 'light' | 'dark'
  loaded: boolean
}

const THEME_KEY = 'homepage.theme'

export const site = reactive<SiteState>({
  site: {},
  profile: null,
  homepage: {},
  integrations: {},
  categories: [],
  theme: (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light',
  loaded: false,
})

export function applyTheme() {
  document.documentElement.dataset.theme = site.theme
  document.documentElement.dataset.accent = site.site.accent || 'violet'
  applyFavicon()

  if (site.site.themeMode === 'dynamic' && hasDynamicTheme()) {
    applyDynamicVars(site.theme)
  } else if (site.site.themeMode !== 'dynamic') {
    clearDynamicTheme()
  }

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    const surface = getComputedStyle(document.documentElement)
      .getPropertyValue('--md-surface')
      .trim()
    meta.setAttribute('content', surface || (site.theme === 'dark' ? '#131016' : '#fdf7ff'))
  }
}

/** Resolve the dynamic-color source image and (re)build the theme. */
export async function applyDynamic() {
  if (site.site.themeMode === 'dynamic') {
    if (site.site.themeSeedColor) {
      // Seed computed server-side — no canvas/CORS involved.
      loadDynamicThemeFromHex(site.site.themeSeedColor)
    } else {
      const url =
        site.site.themeSource === 'custom' && site.site.themeSeed
          ? site.site.themeSeed
          : site.site.themeSource === 'banner'
            ? site.site.banner || site.site.icon || '/favicon.svg'
            : site.site.icon || '/favicon.svg'
      const ok = await loadDynamicThemeFromImage(url)
      if (!ok) clearDynamicTheme()
    }
  } else {
    clearDynamicTheme()
  }
  applyTheme()
}

export function applyFavicon() {
  const href = site.site.icon || '/favicon.svg'
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.setAttribute('href', href)
  let apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
  if (!apple) {
    apple = document.createElement('link')
    apple.rel = 'apple-touch-icon'
    document.head.appendChild(apple)
  }
  apple.setAttribute('href', href)
}

export function toggleTheme() {
  site.theme = site.theme === 'dark' ? 'light' : 'dark'
  localStorage.setItem(THEME_KEY, site.theme)
  applyTheme()
}

export async function loadPublicSite(username = '') {
  const qs = username ? `?username=${encodeURIComponent(username)}` : ''
  const data = await api<{
    site: SiteSettings
    profile: PublicProfile
    homepage: HomepageSettings
    categories: string[]
    integrations: Integrations
  }>(`/settings/public${qs}`, { auth: false })
  site.site = data.site || {}
  site.profile = data.profile
  site.homepage = data.homepage || {}
  site.categories = data.categories || []
  site.integrations = data.integrations || {}
  site.loaded = true
  await applyDynamic()
  if (site.site.title) document.title = site.site.title
}

export async function loadFullSettings() {
  const data = await api<{
    site: SiteSettings
    integrations: Integrations
    links: LinkItem[]
    tags: ProfileTag[]
    categories: string[]
    profile: any
    homepage: HomepageSettings
  }>('/settings')
  site.site = data.site || {}
  site.integrations = data.integrations || {}
  site.homepage = data.homepage || {}
  site.categories = data.categories || []
  applyTheme()
  return data
}

export async function saveHomepage(patch: HomepageSettings) {
  const { homepage } = await api<{ homepage: HomepageSettings }>('/settings/homepage', {
    method: 'PUT',
    body: patch,
  })
  site.homepage = homepage
  return homepage
}

export async function saveCategories(categories: string[]) {
  const res = await api<{ categories: string[] }>('/settings/categories', {
    method: 'PUT',
    body: { categories },
  })
  site.categories = res.categories
  return res.categories
}

export async function saveSiteSettings(patch: Partial<SiteSettings>) {
  const { site: updated } = await api<{ site: SiteSettings }>('/settings/site', {
    method: 'PUT',
    body: patch,
  })
  site.site = updated
  await applyDynamic()
  if (site.site.title) document.title = site.site.title
}

export async function saveIntegrations(patch: Integrations) {
  const { integrations } = await api<{ integrations: Integrations }>('/settings/integrations', {
    method: 'PUT',
    body: patch,
  })
  site.integrations = integrations
  return integrations
}

watch(
  () => site.theme,
  () => applyTheme()
)

watch(
  () => [site.site.themeMode, site.site.themeSource, site.site.themeSeed, site.site.icon] as const,
  () => {
    applyDynamic().catch(() => {})
  }
)
