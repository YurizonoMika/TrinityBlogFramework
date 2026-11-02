// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { reactive } from 'vue'

export interface DialogOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  /** prompt only */
  placeholder?: string
  inputType?: 'text' | 'password'
  /** prompt only: initial input value */
  value?: string
}

type Kind = 'confirm' | 'alert' | 'prompt'

interface DialogState {
  open: boolean
  kind: Kind
  title: string
  message: string
  confirmText: string
  cancelText: string
  danger: boolean
  input: string
  placeholder: string
  inputType: 'text' | 'password'
  resolve: ((value: boolean | string | null) => void) | null
}

export const dialog = reactive<DialogState>({
  open: false,
  kind: 'alert',
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  input: '',
  placeholder: '',
  inputType: 'text',
  resolve: null,
})

function normalize(opts: DialogOptions | string): DialogOptions {
  return typeof opts === 'string' ? { message: opts } : opts
}

function open(kind: Kind, opts: DialogOptions | string): Promise<boolean | string | null> {
  const o = normalize(opts)
  return new Promise<boolean | string | null>((resolve) => {
    Object.assign(dialog, {
      open: true,
      kind,
      title: o.title || '',
      message: o.message,
      confirmText: o.confirmText || (kind === 'alert' ? '知道了' : '确定'),
      cancelText: o.cancelText || '取消',
      danger: Boolean(o.danger),
      input: o.value || '',
      placeholder: o.placeholder || '',
      inputType: o.inputType === 'password' ? 'password' : 'text',
      resolve,
    })
  })
}

/** MD3 confirmation dialog. Resolves true when confirmed, false otherwise. */
export function confirmDialog(opts: DialogOptions | string): Promise<boolean> {
  return open('confirm', opts) as Promise<boolean>
}

/** MD3 alert dialog. Resolves when dismissed. */
export function alertDialog(opts: DialogOptions | string): Promise<void> {
  return open('alert', opts).then(() => undefined)
}

/** MD3 prompt dialog. Resolves the entered string, or null when cancelled. */
export function promptDialog(opts: DialogOptions | string): Promise<string | null> {
  return open('prompt', opts) as Promise<string | null>
}

export function resolveDialog(result: boolean | string | null) {
  const resolve = dialog.resolve
  dialog.open = false
  dialog.resolve = null
  if (resolve) resolve(result)
}
