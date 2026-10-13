// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { ref } from 'vue'

export interface Sortable {
  id: string
}

export function useDragSort<T extends Sortable>(items: () => T[], onReorder: (order: string[]) => void) {
  const dragId = ref<string | null>(null)
  const overId = ref<string | null>(null)

  function dragstart(id: string, e: DragEvent) {
    dragId.value = id
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    }
  }

  function dragover(id: string, e: DragEvent) {
    if (!dragId.value || dragId.value === id) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    overId.value = id
  }

  function drop(id: string, e: DragEvent) {
    e.preventDefault()
    const from = dragId.value
    if (!from || from === id) {
      reset()
      return
    }
    const list = items().map((i) => i.id)
    const fromIndex = list.indexOf(from)
    const toIndex = list.indexOf(id)
    if (fromIndex === -1 || toIndex === -1) {
      reset()
      return
    }
    list.splice(fromIndex, 1)
    list.splice(toIndex, 0, from)
    onReorder(list)
    reset()
  }

  function reset() {
    dragId.value = null
    overId.value = null
  }

  return { dragId, overId, dragstart, dragover, drop, reset }
}
