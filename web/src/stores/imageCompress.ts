// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { reactive } from 'vue'
import {
  MAX_IMAGE_UPLOAD_BYTES,
  formatBytes,
  isCompressibleImage,
} from '@/lib/imageCompress'
import { notify } from './toast'

export type ImageCompressPhase = 'confirm' | 'running' | 'done' | 'error'

interface QueueItem {
  file: File
  maxBytes: number
  resolve: (file: File | null) => void
}

export const imageCompress = reactive({
  open: false,
  phase: 'confirm' as ImageCompressPhase,
  file: null as File | null,
  maxBytes: MAX_IMAGE_UPLOAD_BYTES,
  progress: 0,
  before: 0,
  after: 0,
  error: '',
})

const queue: QueueItem[] = []
let current: QueueItem | null = null

function pump() {
  if (current || !queue.length) return
  current = queue.shift()!
  Object.assign(imageCompress, {
    open: true,
    phase: 'confirm',
    file: current.file,
    maxBytes: current.maxBytes,
    progress: 0,
    before: current.file.size,
    after: 0,
    error: '',
  })
}

/** Ask the user whether to compress an oversized image. */
export function requestImageCompression(
  file: File,
  maxBytes = MAX_IMAGE_UPLOAD_BYTES
): Promise<File | null> {
  return new Promise<File | null>((resolve) => {
    queue.push({ file, maxBytes, resolve })
    pump()
  })
}

/** Resolve the active prompt (file = compressed result, null = cancel/failure). */
export function finishImageCompression(file: File | null) {
  const item = current
  current = null
  imageCompress.open = false
  if (item) item.resolve(file)
  if (queue.length) setTimeout(pump, 0)
}

/**
 * Gate every image upload: small files pass straight through, oversized
 * compressible images open the compression dialog, and formats that cannot be
 * safely re-encoded (GIF/SVG) get a clear message instead of a backend error.
 */
export async function ensureUploadableImage(
  file: File,
  maxBytes = MAX_IMAGE_UPLOAD_BYTES
): Promise<File | null> {
  if (!file.type.startsWith('image/') && !isCompressibleImage(file)) return file
  if (file.size <= maxBytes) return file
  if (!isCompressibleImage(file)) {
    notify(`该图片格式不支持自动压缩，请选择小于 ${formatBytes(maxBytes)} 的图片`, 'error')
    return null
  }
  return requestImageCompression(file, maxBytes)
}
