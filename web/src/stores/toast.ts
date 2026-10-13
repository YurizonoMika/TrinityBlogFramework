// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { ref } from 'vue'

export interface Toast {
  id: number
  message: string
  kind: 'default' | 'success' | 'error'
}

export const toasts = ref<Toast[]>([])
let seq = 0

export function notify(message: string, kind: Toast['kind'] = 'default', duration = 3200) {
  const id = ++seq
  toasts.value.push({ id, message, kind })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, duration)
}

export function dismissToast(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}
