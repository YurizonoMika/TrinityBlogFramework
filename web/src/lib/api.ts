// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

// Session is carried by an HttpOnly cookie — never readable by JS.

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

type Options = {
  method?: string
  body?: unknown
  auth?: boolean
  raw?: boolean
}

export async function api<T = any>(path: string, options: Options = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' }
  let body: BodyInit | undefined
  if (options.body !== undefined) {
    if (options.raw) {
      body = options.body as BodyInit
    } else {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(options.body)
    }
  }
  const res = await fetch(`/api${path}`, {
    method: options.method || (body ? 'POST' : 'GET'),
    headers,
    body,
    credentials: 'same-origin',
  })
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const message = data?.error || `请求失败 (${res.status})`
    throw new ApiError(message, res.status)
  }
  return data as T
}

export function uploadFile(file: File): Promise<{ url: string; name: string; size: number }> {
  const form = new FormData()
  form.append('file', file)
  return api('/upload', { method: 'POST', body: form, raw: true })
}
