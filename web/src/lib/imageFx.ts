// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

/**
 * Global image loading animation.
 * Adds a fade-in to every <img> in the document (including ones added later by
 * the router), keeping the site feeling smooth. Images inside plugin shadow
 * roots manage their own animation and are not affected.
 */
export function installImageFx() {
  const process = (img: HTMLImageElement) => {
    if (img.dataset.fxApplied) return
    img.dataset.fxApplied = '1'

    const done = () => {
      img.classList.add('img-fx-loaded')
      img.classList.remove('img-fx-loading')
    }

    if (img.complete && img.naturalWidth > 0) {
      // already cached — show immediately, no flicker
      img.classList.add('img-fx', 'img-fx-loaded')
      return
    }

    img.classList.add('img-fx', 'img-fx-loading')
    img.addEventListener('load', done, { once: true })
    img.addEventListener('error', done, { once: true })
  }

  const scan = (node: Element) => {
    if (node instanceof HTMLImageElement) process(node)
    else node.querySelectorAll('img').forEach(process)
  }

  document.querySelectorAll('img').forEach(process)

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (n instanceof Element) scan(n)
      })
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
}
