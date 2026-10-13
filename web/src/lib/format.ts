// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

export function formatDate(input: string | Date, withTime = false): string {
  const d = typeof input === 'string' ? new Date(input.includes('T') ? input : input.replace(' ', 'T') + 'Z') : input
  if (Number.isNaN(d.getTime())) return ''
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }
  return new Intl.DateTimeFormat('zh-CN', opts).format(d)
}

export function formatRelative(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input.includes('T') ? input : input.replace(' ', 'T') + 'Z') : input
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const mins = Math.round(diff / 60000)
  if (Math.abs(mins) < 1) return '刚刚'
  if (Math.abs(mins) < 60) return `${mins} 分钟前`
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 24) return `${hours} 小时前`
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return `${days} 天前`
  return formatDate(d)
}

export function readingTime(markdown: string): number {
  const chars = markdown.replace(/\s+/g, '').length
  return Math.max(1, Math.round(chars / 400))
}
