// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import {
  Hct,
  MaterialDynamicColors as C,
  SchemeTonalSpot,
  argbFromHex,
  hexFromArgb,
  sourceColorFromImage,
} from '@material/material-color-utilities'

type Vars = Record<string, string>

const MANAGED_VARS = [
  '--p', '--op', '--pc', '--opc',
  '--s', '--os', '--sc', '--osc',
  '--t', '--ot', '--tc', '--otc',
  '--md-primary', '--md-on-primary', '--md-primary-container', '--md-on-primary-container',
  '--md-secondary', '--md-on-secondary', '--md-secondary-container', '--md-on-secondary-container',
  '--md-tertiary', '--md-on-tertiary', '--md-tertiary-container', '--md-on-tertiary-container',
  '--md-error', '--md-on-error', '--md-error-container', '--md-on-error-container',
  '--md-surface', '--md-on-surface', '--md-surface-variant', '--md-on-surface-variant',
  '--md-surface-container-lowest', '--md-surface-container-low', '--md-surface-container',
  '--md-surface-container-high', '--md-surface-container-highest', '--md-surface-dim',
  '--md-outline', '--md-outline-variant', '--md-inverse-surface', '--md-inverse-on-surface',
  '--md-inverse-primary',
]

let schemes: { light: Vars; dark: Vars } | null = null
let lastSource: string | null = null

function hex(getter: { getArgb: (s: SchemeTonalSpot) => number }, scheme: SchemeTonalSpot): string {
  return hexFromArgb(getter.getArgb(scheme))
}

function schemeVars(scheme: SchemeTonalSpot): Vars {
  const primary = hex(C.primary, scheme)
  const onPrimary = hex(C.onPrimary, scheme)
  const primaryContainer = hex(C.primaryContainer, scheme)
  const onPrimaryContainer = hex(C.onPrimaryContainer, scheme)
  const secondary = hex(C.secondary, scheme)
  const onSecondary = hex(C.onSecondary, scheme)
  const secondaryContainer = hex(C.secondaryContainer, scheme)
  const onSecondaryContainer = hex(C.onSecondaryContainer, scheme)
  const tertiary = hex(C.tertiary, scheme)
  const onTertiary = hex(C.onTertiary, scheme)
  const tertiaryContainer = hex(C.tertiaryContainer, scheme)
  const onTertiaryContainer = hex(C.onTertiaryContainer, scheme)

  return {
    // accent fallback variables (used to derive roles in tokens.css)
    '--p': primary, '--op': onPrimary, '--pc': primaryContainer, '--opc': onPrimaryContainer,
    '--s': secondary, '--os': onSecondary, '--sc': secondaryContainer, '--osc': onSecondaryContainer,
    '--t': tertiary, '--ot': onTertiary, '--tc': tertiaryContainer, '--otc': onTertiaryContainer,

    '--md-primary': primary,
    '--md-on-primary': onPrimary,
    '--md-primary-container': primaryContainer,
    '--md-on-primary-container': onPrimaryContainer,
    '--md-secondary': secondary,
    '--md-on-secondary': onSecondary,
    '--md-secondary-container': secondaryContainer,
    '--md-on-secondary-container': onSecondaryContainer,
    '--md-tertiary': tertiary,
    '--md-on-tertiary': onTertiary,
    '--md-tertiary-container': tertiaryContainer,
    '--md-on-tertiary-container': onTertiaryContainer,
    '--md-error': hex(C.error, scheme),
    '--md-on-error': hex(C.onError, scheme),
    '--md-error-container': hex(C.errorContainer, scheme),
    '--md-on-error-container': hex(C.onErrorContainer, scheme),
    '--md-surface': hex(C.surface, scheme),
    '--md-on-surface': hex(C.onSurface, scheme),
    '--md-surface-variant': hex(C.surfaceVariant, scheme),
    '--md-on-surface-variant': hex(C.onSurfaceVariant, scheme),
    '--md-surface-container-lowest': hex(C.surfaceContainerLowest, scheme),
    '--md-surface-container-low': hex(C.surfaceContainerLow, scheme),
    '--md-surface-container': hex(C.surfaceContainer, scheme),
    '--md-surface-container-high': hex(C.surfaceContainerHigh, scheme),
    '--md-surface-container-highest': hex(C.surfaceContainerHighest, scheme),
    '--md-surface-dim': hex(C.surfaceDim, scheme),
    '--md-outline': hex(C.outline, scheme),
    '--md-outline-variant': hex(C.outlineVariant, scheme),
    '--md-inverse-surface': hex(C.inverseSurface, scheme),
    '--md-inverse-on-surface': hex(C.inverseOnSurface, scheme),
    '--md-inverse-primary': hex(C.inversePrimary, scheme),
  }
}

function buildFromArgb(argb: number) {
  const hct = Hct.fromInt(argb)
  return {
    light: schemeVars(new SchemeTonalSpot(hct, false, 0)),
    dark: schemeVars(new SchemeTonalSpot(hct, true, 0)),
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (/^https?:/i.test(url)) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

export function hasDynamicTheme(): boolean {
  return Boolean(schemes)
}

export function clearDynamicTheme() {
  schemes = null
  lastSource = null
  MANAGED_VARS.forEach((key) => document.documentElement.style.removeProperty(key))
}

/** Extract a seed color from an image URL and build light/dark Material You (Tonal Spot) schemes. */
export async function loadDynamicThemeFromImage(url: string): Promise<boolean> {
  if (!url) return false
  try {
    const image = await loadImage(url)
    const argb = await sourceColorFromImage(image)
    schemes = buildFromArgb(argb)
    lastSource = url
    return true
  } catch {
    schemes = null
    lastSource = null
    return false
  }
}

/** Build schemes from a hex seed (fallback / manual override). */
export function loadDynamicThemeFromHex(hexColor: string): boolean {
  try {
    schemes = buildFromArgb(argbFromHex(hexColor))
    lastSource = hexColor
    return true
  } catch {
    schemes = null
    return false
  }
}

export function getDynamicSource(): string | null {
  return lastSource
}

export function applyDynamicVars(theme: 'light' | 'dark') {
  if (!schemes) return
  const vars = schemes[theme]
  for (const [key, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(key, value)
  }
}
