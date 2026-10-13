// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { ref } from 'vue'

export const paletteOpen = ref(false)

export function openPalette() {
  paletteOpen.value = true
}

export function closePalette() {
  paletteOpen.value = false
}
