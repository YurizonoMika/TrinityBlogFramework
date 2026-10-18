// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { reactive } from 'vue'
import { api } from '@/lib/api'

export interface ThemeOptionDef {
  id: string
  label: string
  type: 'color' | 'text' | 'select' | 'boolean' | 'image'
  default: unknown
  options?: string[]
  /** extra CSS variables applied only while this option has a value */
  whenSet?: Record<string, string>
  /** image options: measure the image and expose an auto-contrast text colour */
  contrast?: boolean
}

/** A color scheme embedded by a theme; it can override the default palettes. */
export interface ThemeScheme {
  id: string
  label: string
  color: string
  vars: Record<string, string>
}

interface ThemeState {
  id: string
  name: string
  /** theme.css is loaded via <link> so relative assets/fonts resolve */
  cssUrl: string
  hasCss: boolean
  /** icon name → svg path `d` overrides (AppIcon) */
  icons: Record<string, string>
  /** optional markup injected once into the DOM (e.g. inline <svg> filters) */
  html: string
  preview: string
  options: ThemeOptionDef[]
  values: Record<string, unknown>
  /** color schemes the theme embeds (empty = use the site's own schemes) */
  schemes: ThemeScheme[]
  /** currently selected scheme id */
  scheme: string
  loaded: boolean
}

export const theme = reactive<ThemeState>({
  id: '',
  name: '',
  cssUrl: '',
  hasCss: false,
  icons: {},
  html: '',
  preview: '',
  options: [],
  values: {},
  schemes: [],
  scheme: '',
  loaded: false,
})

const LINK_ID = 'oc-theme-css'
const DOM_ID = 'oc-theme-dom'
const VAR_PREFIX = '--opt-'

/** CSS custom properties set by the active color scheme (to clean up on switch). */
let schemeVars: string[] = []
/** Conditional option vars (`whenSet`) currently applied (to clean up). */
let conditionalVars: string[] = []

function isSet(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return value !== '' && value !== null && value !== undefined
}

function applyThemeStyles() {
  let link = document.getElementById(LINK_ID) as HTMLLinkElement | null
  if (!theme.hasCss || !theme.cssUrl) {
    if (link) link.remove()
    return
  }
  if (!link) {
    link = document.createElement('link')
    link.id = LINK_ID
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }
  if (link.getAttribute('href') !== theme.cssUrl) link.setAttribute('href', theme.cssUrl)
}

/** Expose the theme's option values as CSS variables (inherit into shadow DOM). */
function applyOptionVars() {
  const root = document.documentElement
  const defs = new Map(theme.options.map((o) => [o.id, o]))
  // clear previously-applied option vars
  for (const name of Array.from(root.style)) {
    if (name.startsWith('--opt-')) root.style.removeProperty(name)
  }
  for (const name of conditionalVars) root.style.removeProperty(name)
  conditionalVars = []
  for (const [id, value] of Object.entries(theme.values)) {
    const def = defs.get(id)
    if (!def) continue
    let v: string
    if (def.type === 'boolean') v = value ? '1' : '0'
    else if (def.type === 'image') v = value ? `url("${String(value).replace(/["\\]/g, '')}")` : 'none'
    else v = String(value ?? '')
    root.style.setProperty(`${VAR_PREFIX}${id}`, v)
    if (def.whenSet && isSet(value)) {
      for (const [name, val] of Object.entries(def.whenSet)) {
        if (!name.startsWith('--')) continue
        root.style.setProperty(name, val)
        conditionalVars.push(name)
      }
    }
  }
}

/** Apply the selected embedded color scheme, overriding the site default palettes. */
function applySchemeVars() {
  const root = document.documentElement
  for (const name of schemeVars) root.style.removeProperty(name)
  schemeVars = []
  const current = theme.schemes.find((s) => s.id === theme.scheme) || theme.schemes[0]
  if (!current) return
  for (const [name, value] of Object.entries(current.vars || {})) {
    if (!name.startsWith('--')) continue
    root.style.setProperty(name, value)
    schemeVars.push(name)
  }
}

/* ---- auto-contrast text over an imported background image ---- */
let contrastVars: string[] = []
let contrastToken = 0
const measuredLuma = new Map<string, { url: string; luma: number | null }>()

/** Average relative luminance (0..1) of an image, or null if unreadable. */
function imageLuminance(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image()
    if (/^https?:/i.test(url) && !url.startsWith(location.origin)) img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const size = 32
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        let sum = 0
        for (let i = 0; i < data.length; i += 4) {
          sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
        }
        resolve(sum / (data.length / 4) / 255)
      } catch {
        resolve(null) // tainted canvas (cross-origin image)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function clearContrastVars() {
  const root = document.documentElement
  for (const name of contrastVars) root.style.removeProperty(name)
  contrastVars = []
}

/** For each image option flagged `contrast`, expose a readable text colour. */
async function applyImageContrast() {
  const token = ++contrastToken
  clearContrastVars()
  const defs = theme.options.filter((o) => o.type === 'image' && o.contrast)
  if (!defs.length) return
  const root = document.documentElement
  for (const def of defs) {
    const url = theme.values[def.id]
    if (typeof url !== 'string' || !url) continue
    let entry = measuredLuma.get(def.id)
    if (!entry || entry.url !== url) {
      entry = { url, luma: await imageLuminance(url) }
      measuredLuma.set(def.id, entry)
    }
    if (token !== contrastToken || entry.luma === null) continue
    const on = entry.luma < 0.5 ? '#ffffff' : '#141414'
    const vars: Record<string, string> = {
      [`${VAR_PREFIX}${def.id}-luma`]: entry.luma.toFixed(3),
      [`${VAR_PREFIX}${def.id}-on`]: on,
    }
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value)
      contrastVars.push(name)
    }
  }
}

function sanitizeThemeHtml(html: string): string {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g, '')
}

function applyThemeDom() {
  let el = document.getElementById(DOM_ID)
  if (!theme.html) {
    if (el) el.remove()
    return
  }
  if (!el) {
    el = document.createElement('div')
    el.id = DOM_ID
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'
    document.body.appendChild(el)
  }
  el.innerHTML = sanitizeThemeHtml(theme.html)
}

export function setTheme(t: Partial<ThemeState> | null) {
  theme.id = t?.id || ''
  theme.name = t?.name || ''
  theme.hasCss = Boolean(t?.hasCss && t?.cssUrl)
  theme.cssUrl = t?.cssUrl || ''
  theme.icons = t?.icons || {}
  theme.html = t?.html || ''
  theme.preview = t?.preview || ''
  theme.options = Array.isArray(t?.options) ? (t!.options as ThemeOptionDef[]) : []
  theme.values = t?.values || {}
  theme.schemes = Array.isArray(t?.schemes) ? (t!.schemes as ThemeScheme[]) : []
  theme.scheme = t?.scheme || theme.schemes[0]?.id || ''
  theme.loaded = true
  applyThemeStyles()
  applyOptionVars()
  applySchemeVars()
  applyImageContrast()
  applyThemeDom()
}

/** True when the active theme embeds its own color schemes (overrides defaults). */
export function hasThemeSchemes(): boolean {
  return theme.schemes.length > 0
}

/** Select an embedded scheme live (persist separately via the theme endpoint). */
export function setThemeScheme(id: string) {
  theme.scheme = id
  applySchemeVars()
}

/** Update the applied option values live (e.g. live preview while editing). */
export function setThemeValues(values: Record<string, unknown>) {
  theme.values = { ...theme.values, ...values }
  applyOptionVars()
  applySchemeVars()
  applyImageContrast()
}

/** Load the theme applied by a page owner ('' = site owner). */
export async function loadTheme(username = '') {
  try {
    const qs = username ? `?username=${encodeURIComponent(username)}` : ''
    const res = await api<{ theme: Partial<ThemeState> | null }>(`/themes/active${qs}`, { auth: false })
    setTheme(res.theme)
  } catch {
    setTheme(null)
  }
}

export function clearTheme() {
  setTheme(null)
}
