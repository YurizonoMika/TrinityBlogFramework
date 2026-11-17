// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({
  gfm: true,
  breaks: true,
})

/** Escape user-supplied attribute values before they reach the HTML string. */
function attr(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;')
}

/** Plain text of inline tokens, used to derive stable heading ids. */
function inlineText(tokens: any[]): string {
  let out = ''
  for (const token of tokens || []) {
    if (!token) continue
    if (token.type === 'text' || token.type === 'codespan' || token.type === 'escape') {
      out += token.text || ''
    } else if (token.type === 'br') {
      out += ' '
    } else if (token.type === 'image') {
      out += token.text || ''
    } else if (token.tokens) {
      out += inlineText(token.tokens)
    } else if (token.type === 'html') {
      out += String(token.text || token.raw || '').replace(/<[^>]*>/g, '')
    } else {
      out += token.raw || ''
    }
  }
  return out
}

function headingSlug(text: string): string {
  // preserve case and punctuation so `## ABC` can be linked as `#ABC` (the
  // common authoring style); only whitespace is normalised
  const base = String(text || '')
    .replace(/[\u0000-\u001f\u007f]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'section'
}

function uniqueHeadingId(base: string, used: Set<string>): string {
  let id = base
  let n = 2
  while (used.has(id)) id = `${base}-${n++}`
  used.add(id)
  return id
}

function createRenderer(usedIds: Set<string>) {
  const renderer = new marked.Renderer()

  renderer.image = ({ href, title, text }) => {
    const safeHref = attr(href)
    const t = title ? ` title="${attr(title)}"` : ''
    return `<figure class="md-figure"><img src="${safeHref}" alt="${attr(text || '')}"${t} loading="lazy" />${
      text ? `<figcaption>${attr(text)}</figcaption>` : ''
    }</figure>`
  }

  // Without an id, in-page links like [ABC](#ABC) have no target and the
  // browser falls back to the top of the page.
  renderer.heading = function (this: any, { tokens, depth }) {
    const id = uniqueHeadingId(headingSlug(inlineText(tokens)), usedIds)
    return `<h${depth} id="${attr(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`
  }

  return renderer
}

export function renderMarkdown(source: string, usedIds: Set<string> = new Set()): string {
  if (!source) return ''
  const html = marked.parse(source, { renderer: createRenderer(usedIds) }) as string
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel', 'loading', 'id'],
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
