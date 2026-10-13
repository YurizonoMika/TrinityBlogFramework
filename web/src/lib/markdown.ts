// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({
  gfm: true,
  breaks: true,
})

const renderer = new marked.Renderer()

renderer.image = ({ href, title, text }) => {
  const t = title ? ` title="${title}"` : ''
  return `<figure class="md-figure"><img src="${href}" alt="${text || ''}"${t} loading="lazy" />${
    text ? `<figcaption>${text}</figcaption>` : ''
  }</figure>`
}

marked.use({ renderer })

export function renderMarkdown(source: string): string {
  if (!source) return ''
  const html = marked.parse(source) as string
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel', 'loading'],
    ADD_TAGS: ['figure', 'figcaption'],
  })
}

export function excerpt(markdown: string, length = 140): string {
  const plain = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`_~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > length ? `${plain.slice(0, length)}…` : plain
}
