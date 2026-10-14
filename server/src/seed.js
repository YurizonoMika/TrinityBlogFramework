// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { UPLOAD_DIR } from './db.js'

function rgbToHsl(r, g, b) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  return { h, s, l }
}

function toHex(r, g, b) {
  const c = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

async function loadBuffer(source) {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`fetch failed ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
  if (source.startsWith('/uploads/')) {
    const rel = source.slice('/uploads/'.length).split(/[?#]/)[0]
    if (!rel || rel.includes('..')) throw new Error('invalid upload path')
    let decoded = rel
    try {
      decoded = decodeURIComponent(rel)
    } catch {
      /* keep raw */
    }
    return readFile(join(UPLOAD_DIR, decoded))
  }
  return readFile(source)
}

/**
 * Extract a vibrant "seed" color from an image (local upload, remote URL or file path).
 * Used to drive the Material You dynamic color theme on the frontend.
 */
export async function extractSeedColor(source) {
  if (!source) return null
  try {
    const buf = await loadBuffer(source)
    const { data, info } = await sharp(buf)
      .resize(72, 72, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const ch = info.channels
    const buckets = new Map()
    let ar = 0
    let ag = 0
    let ab = 0
    let an = 0

    for (let i = 0; i < data.length; i += ch) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = ch > 3 ? data[i + 3] : 255
      if (a < 128) continue
      ar += r
      ag += g
      ab += b
      an++

      const { h, s, l } = rgbToHsl(r, g, b)
      if (s < 0.16 || l < 0.16 || l > 0.92) continue
      const key = Math.round(h / 15) % 24
      const entry = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0, sat: 0 }
      entry.count++
      entry.r += r
      entry.g += g
      entry.b += b
      entry.sat += s
      buckets.set(key, entry)
    }

    let best = null
    let bestScore = -1
    for (const entry of buckets.values()) {
      const score = entry.count * (entry.sat / entry.count)
      if (score > bestScore) {
        bestScore = score
        best = entry
      }
    }
    if (best && best.count) {
      return toHex(best.r / best.count, best.g / best.count, best.b / best.count)
    }
    if (an) return toHex(ar / an, ag / an, ab / an)
    return null
  } catch {
    return null
  }
}

/** Resolve the dynamic-color source image from site settings. */
export function resolveThemeSource(site) {
  if (!site) return null
  if (site.themeSource === 'custom' && site.themeSeed) return site.themeSeed
  if (site.themeSource === 'banner') return site.banner || site.icon || null
  return site.icon || null
}
