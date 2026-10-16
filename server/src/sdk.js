// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

/**
 * Framework SDK version, shared by plugins and themes. A plugin/theme may
 * declare `minSdkVersion` in its manifest; installing/loading it is refused when
 * the running framework is older than the requirement.
 */
export const SDK_VERSION = '1.0.0'

function parseSemver(v) {
  return String(v || '')
    .split(/[.+-]/)
    .slice(0, 3)
    .map((n) => parseInt(n, 10) || 0)
}

/** Compare two semver-ish strings → -1 | 0 | 1. */
export function compareSemver(a, b) {
  const x = parseSemver(a)
  const y = parseSemver(b)
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
  }
  return 0
}

/** Whether the framework SDK satisfies a minimum requirement. */
export function sdkSatisfies(minSdkVersion) {
  if (!minSdkVersion) return true
  return compareSemver(SDK_VERSION, minSdkVersion) >= 0
}
