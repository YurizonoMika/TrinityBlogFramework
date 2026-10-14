// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

/**
 * Resolve which user's data a public read targets.
 *
 *  1. an explicit `?username=` always wins;
 *  2. otherwise infer from the request's Referer — the SPA keeps the document
 *     URL in sync with the route, so a widget on `/user/bob` sends
 *     `Referer: .../user/bob`;
 *  3. otherwise null (the caller falls back to the site owner).
 *
 * This is the central guarantee that account data stays isolated: it does not
 * depend on every component/plugin remembering to pass `?username=`.
 */
export function pageUsername(req) {
  const explicit = req.query?.username
  if (explicit) return String(explicit)
  const ref = (req.get && (req.get('referer') || req.get('referrer'))) || ''
  const match = String(ref).match(/\/user\/([^/?#]+)/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}
