#!/usr/bin/env node
/**
 * Prepend SPDX license headers to source files.
 * Usage: node scripts/add-license-headers.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const HOLDER = 'Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)'
const SPDX = 'SPDX-License-Identifier: AGPL-3.0-or-later'

const ROOTS = ['server/src', 'web/src']
const EXTS = new Set(['.js', '.mjs', '.ts', '.vue'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git'])

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) files.push(...walk(full))
    else if (EXTS.has(extname(entry))) files.push(full)
  }
  return files
}

function headerFor(ext) {
  if (ext === '.vue') {
    return `<!-- ${SPDX} -->\n<!-- ${HOLDER} -->\n\n`
  }
  return `// ${SPDX}\n// ${HOLDER}\n\n`
}

let changed = 0
for (const root of ROOTS) {
  let files = []
  try {
    files = walk(root)
  } catch {
    continue
  }
  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    if (content.includes('SPDX-License-Identifier')) continue
    writeFileSync(file, headerFor(extname(file)) + content)
    changed++
  }
}
console.log(`Added SPDX headers to ${changed} file(s).`)
