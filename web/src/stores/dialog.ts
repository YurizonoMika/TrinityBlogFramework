// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { reactive } from 'vue'

export interface DialogOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

type Kind = 'confirm' | 'alert'

interface DialogState {
  open: boolean
  kind: Kind
  title: string
  message: string
  confirmText: string
  cancelText: string
  danger: boolean
  resolve: ((value: boolean) => void) | null
}

export const dialog = reactive<DialogState>({
  open: false,
  kind: 'alert',
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  resolve: null,
})

function normalize(opts: DialogOptions | string): DialogOptions {
  return typeof opts === 'string' ? { message: opts } : opts
}

function open(kind: Kind, opts: DialogOptions | string): Promise<boolean> {
  const o = normalize(opts)
  return new Promise<boolean>((resolve) => {
    Object.assign(dialog, {
      open: true,
      kind,
      title: o.title || '',
      message: o.message,
      confirmText: o.confirmText || (kind === 'confirm' ? '确定' : '知道了'),
      cancelText: o.cancelText || '取消',
      danger: Boolean(o.danger),
      resolve,
    })
  })
}

/** MD3 confirmation dialog. Resolves true when confirmed, false otherwise. */
export function confirmDialog(opts: DialogOptions | string): Promise<boolean> {
  return open('confirm', opts)
}

/** MD3 alert dialog. Resolves when dismissed. */
export function alertDialog(opts: DialogOptions | string): Promise<void> {
  return open('alert', opts).then(() => undefined)
}

export function resolveDialog(result: boolean) {
  const resolve = dialog.resolve
  dialog.open = false
  dialog.resolve = null
  if (resolve) resolve(result)
}
