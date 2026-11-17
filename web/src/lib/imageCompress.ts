// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

/**
 * Client-side image compression used before uploading. The backend accepts
 * images up to 8 MiB; larger images are re-encoded to WebP (or JPEG when the
 * browser cannot encode WebP) and progressively scaled down until they fit.
 */

export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024

export interface CompressImageOptions {
  maxBytes?: number
  onProgress?: (ratio: number) => void
}

export function formatBytes(bytes: number): string {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const value = n / 1024 ** i
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

/** Formats that cannot be safely re-encoded without losing animation/vector data. */
export function isCompressibleImage(file: File): boolean {
  const type = String(file.type || '').toLowerCase()
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
  if (type === 'image/gif' || type === 'image/svg+xml' || ext === 'gif' || ext === 'svg') {
    return false
  }
  return (
    type.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'webp', 'avif', 'bmp'].includes(ext)
  )
}

type LoadedImage = {
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      } as ImageBitmapOptions)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      }
    } catch {
      /* fall back to an <img> below */
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('无法读取图片'))
      img.src = url
    })
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('无法读取图片')
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err instanceof Error ? err : new Error('无法读取图片')
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片编码失败'))),
      type,
      quality
    )
  })
}

function outputExtension(type: string): string {
  if (type === 'image/jpeg') return 'jpg'
  if (type === 'image/png') return 'png'
  return 'webp'
}

/**
 * Compress `file` until it is at most `maxBytes`. Returns a new File, or null
 * when the image cannot be read/encoded within the limit.
 */
export async function compressImageFile(
  file: File,
  options: CompressImageOptions = {}
): Promise<File | null> {
  const maxBytes = options.maxBytes ?? MAX_IMAGE_UPLOAD_BYTES
  if (!isCompressibleImage(file)) return null

  const progress = (ratio: number) => options.onProgress?.(Math.max(0, Math.min(1, ratio)))
  progress(0.02)

  let loaded: LoadedImage | null = null
  try {
    loaded = await loadImage(file)
    progress(0.1)
    if (!loaded.width || !loaded.height) return null

    const source = loaded.source
    let maxDimension = 2560
    let quality = 0.88
    let best: Blob | null = null

    for (let attempt = 0; attempt < 7; attempt++) {
      const scale = Math.min(1, maxDimension / Math.max(loaded.width, loaded.height))
      const width = Math.max(1, Math.round(loaded.width * scale))
      const height = Math.max(1, Math.round(loaded.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('浏览器不支持图片压缩')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(source, 0, 0, width, height)
      progress(0.18 + attempt * 0.1)

      let blob = await canvasToBlob(canvas, 'image/webp', quality)
      if (blob.type !== 'image/webp') {
        // WebP encoding is unavailable: flatten transparency on white and use JPEG.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(source, 0, 0, width, height)
        blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      }
      progress(0.24 + attempt * 0.1)
      best = blob
      if (blob.size <= maxBytes) break

      if (quality > 0.52) {
        quality = Math.max(0.5, quality - 0.1)
      } else {
        maxDimension = Math.max(1024, Math.round(maxDimension * 0.78))
        quality = 0.82
      }
    }

    if (!best || best.size > maxBytes) return null
    progress(0.98)

    const ext = outputExtension(best.type)
    const base = file.name.replace(/\.[^.]+$/, '') || 'image'
    progress(1)
    return new File([best], `${base}.${ext}`, {
      type: best.type || 'image/webp',
      lastModified: Date.now(),
    })
  } finally {
    loaded?.close()
  }
}
