#!/usr/bin/env node
/**
 * Generate THIRD-PARTY-LICENSES.md from installed dependencies.
 * Usage: node scripts/generate-licenses.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

const ROOTS = ['web/node_modules', 'server/node_modules']
const OUT = 'THIRD-PARTY-LICENSES.md'
const LICENSE_FILE_RE = /^(LICEN[CS]E|COPYING|UNLICENSE)(-[\w.]+)?(\.(md|markdown|txt))?$/i

function walk(dir, onDir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  onDir(dir)
  for (const entry of entries) {
    if (entry === '.bin') continue
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full, onDir)
  }
}

function readLicenseText(pkgDir) {
  let files
  try {
    files = readdirSync(pkgDir)
  } catch {
    return null
  }
  const candidates = files.filter((f) => LICENSE_FILE_RE.test(f)).sort()
  for (const f of candidates) {
    const p = join(pkgDir, f)
    try {
      if (statSync(p).isFile()) {
        const text = readFileSync(p, 'utf-8').trim()
        if (text.length > 20) return text
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

function licenseOf(pkg) {
  let l = pkg.license
  if (!l && pkg.licenses) {
    l = Array.isArray(pkg.licenses) ? pkg.licenses.map((x) => x.type).join(' OR ') : pkg.licenses.type
  }
  if (!l) return null
  return typeof l === 'string' ? l : l.type || null
}

const packages = new Map()

for (const root of ROOTS) {
  if (!existsSync(root)) continue
  walk(root, (dir) => {
    const pj = join(dir, 'package.json')
    if (!existsSync(pj)) return
    // only treat directories directly inside a node_modules as packages
    const parts = dir.split('/')
    if (!parts.includes('node_modules')) return
    try {
      const pkg = JSON.parse(readFileSync(pj, 'utf-8'))
      if (!pkg.name || !pkg.version) return
      const key = `${pkg.name}@${pkg.version}`
      if (packages.has(key)) return
      const license = licenseOf(pkg)
      const text = readLicenseText(dir)
      packages.set(key, {
        name: pkg.name,
        version: pkg.version,
        license: license || (text ? 'UNKNOWN (see license file)' : 'UNKNOWN'),
        text,
        homepage: (pkg.homepage || '').toString(),
      })
    } catch {
      /* ignore */
    }
  })
}

const list = [...packages.values()].sort((a, b) =>
  a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)
)

// Group license texts (deduplicated by license id, using the first package that ships a text)
const texts = new Map()
for (const p of list) {
  if (!p.text) continue
  const id = p.license
  if (!texts.has(id)) texts.set(id, { sample: p.name, text: p.text })
}

const licenseCounts = {}
for (const p of list) licenseCounts[p.license] = (licenseCounts[p.license] || 0) + 1

const now = new Date().toISOString().slice(0, 10)

let md = `# Third-Party Licenses

This project (**Trinity Blog Framework**, Copyright (C) 2026 YurizonoMika) is
licensed under **AGPL-3.0-or-later**. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

It bundles or depends on the following third-party open source software.
Generated on ${now} from the installed dependency tree (${list.length} packages).

## Summary

`
for (const [lic, count] of Object.entries(licenseCounts).sort((a, b) => b[1] - a[1])) {
  md += `- **${lic}** — ${count} package(s)\n`
}

md += `\n## Components\n\n| Package | Version | License |\n|---|---|---|\n`
for (const p of list) {
  md += `| ${p.name} | ${p.version} | ${p.license} |\n`
}

md += `\n## License texts\n\n`
for (const [id, { sample, text }] of [...texts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  md += `### ${id}\n\n<sub>Representative text from \`${sample}\`; other packages under the same license use equivalent terms.</sub>\n\n\`\`\`\n${text}\n\`\`\`\n\n`
}

const missing = list.filter((p) => !p.text).map((p) => `${p.name}@${p.version}`)
if (missing.length) {
  md += `## Packages without a bundled license text\n\nThe following packages did not include a license file in their npm tarball. Refer to their repository for terms:\n\n`
  for (const m of missing) md += `- ${m}\n`
  md += '\n'
}

writeFileSync(OUT, md)
console.log(`Wrote ${OUT}: ${list.length} packages, ${texts.size} license texts, ${missing.length} without text.`)
