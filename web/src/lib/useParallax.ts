// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Scroll-linked parallax for a background layer inside an overflow-hidden host.
 * The layer is translated relative to its host so it appears to scroll slower.
 *
 * @param target  ref to the background layer element
 * @param factor  parallax strength (0 = none)
 * @param max     maximum translation in px
 */
export function useParallax(target: Ref<HTMLElement | null>, factor = 0.28, max = 120) {
  let raf = 0

  function update() {
    const el = target.value
    const host = el?.parentElement
    if (!el || !host) return
    const rect = host.getBoundingClientRect()
    if (rect.bottom < -240 || rect.top > window.innerHeight + 240) return
    const offset = Math.max(-max, Math.min(max, -rect.top * factor))
    el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`
  }

  function onScroll() {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(update)
  }

  onMounted(() => {
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    cancelAnimationFrame(raf)
  })

  return { update }
}
