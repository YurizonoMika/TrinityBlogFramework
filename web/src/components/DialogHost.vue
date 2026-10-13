<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { dialog, resolveDialog } from '@/stores/dialog'

function onKey(e: KeyboardEvent) {
  if (!dialog.open) return
  if (e.key === 'Escape') resolveDialog(false)
  else if (e.key === 'Enter') resolveDialog(true)
}

onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <teleport to="body">
    <transition name="dlg">
      <div v-if="dialog.open" class="scrim" @click.self="resolveDialog(false)">
        <div class="dialog dlg-card" role="dialog" aria-modal="true">
          <h2 v-if="dialog.title" class="dialog-title">{{ dialog.title }}</h2>
          <p class="dlg-message">{{ dialog.message }}</p>
          <div class="dialog-actions">
            <button v-if="dialog.kind === 'confirm'" class="btn" @click="resolveDialog(false)">
              {{ dialog.cancelText }}
            </button>
            <button
              class="btn"
              :class="dialog.danger ? 'btn-danger' : 'btn-filled'"
              @click="resolveDialog(true)"
            >
              {{ dialog.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.dlg-message {
  color: var(--md-on-surface-variant);
  line-height: 1.7;
  white-space: pre-line;
}
/* the global .scrim/.dialog have keyframe animations; use the transition instead */
.scrim,
.dlg-card {
  animation: none;
}
.dlg-enter-active,
.dlg-leave-active {
  transition: opacity var(--md-dur-medium) var(--md-ease-standard);
}
.dlg-enter-active .dlg-card {
  transition: transform var(--md-dur-medium) var(--md-ease-expressive),
    opacity var(--md-dur-medium) var(--md-ease-standard);
}
.dlg-leave-active .dlg-card {
  transition: transform var(--md-dur-short) var(--md-ease-standard),
    opacity var(--md-dur-short) var(--md-ease-standard);
}
.dlg-enter-from,
.dlg-leave-to {
  opacity: 0;
}
.dlg-enter-from .dlg-card {
  opacity: 0;
  transform: translateY(16px) scale(0.94);
}
.dlg-leave-to .dlg-card {
  opacity: 0;
  transform: scale(0.96);
}
</style>
