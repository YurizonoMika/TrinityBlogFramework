<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { dialog, resolveDialog } from '@/stores/dialog'

const inputRef = ref<HTMLInputElement | null>(null)

function cancel() {
  resolveDialog(dialog.kind === 'prompt' ? null : false)
}

function submit() {
  resolveDialog(dialog.kind === 'prompt' ? dialog.input : true)
}

function onKey(e: KeyboardEvent) {
  if (!dialog.open) return
  if (e.key === 'Escape') cancel()
  else if (e.key === 'Enter') submit()
}

watch(
  () => [dialog.open, dialog.kind] as const,
  ([open, kind]) => {
    if (!open || kind !== 'prompt') return
    nextTick(() => {
      inputRef.value?.focus()
      if (dialog.input) inputRef.value?.select()
    })
  }
)

onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <teleport to="body">
    <transition name="dlg">
      <div v-if="dialog.open" class="scrim" @click.self="cancel">
        <div class="dialog dlg-card" role="dialog" aria-modal="true">
          <h2 v-if="dialog.title" class="dialog-title">{{ dialog.title }}</h2>
          <p class="dlg-message">{{ dialog.message }}</p>
          <input
            v-if="dialog.kind === 'prompt'"
            ref="inputRef"
            v-model="dialog.input"
            class="dlg-input"
            :type="dialog.inputType"
            :placeholder="dialog.placeholder"
            :aria-label="dialog.placeholder || '输入'"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <div class="dialog-actions">
            <button v-if="dialog.kind !== 'alert'" class="btn" @click="cancel">
              {{ dialog.cancelText }}
            </button>
            <button
              class="btn"
              :class="dialog.danger ? 'btn-danger' : 'btn-filled'"
              @click="submit"
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
.dlg-input {
  width: 100%;
  min-height: 52px;
  margin-top: 10px;
  padding: 0 14px;
  border: 1px solid var(--md-outline);
  border-radius: var(--field-radius, var(--md-shape-xs));
  background: var(--md-surface-container-highest);
  color: var(--md-on-surface);
  font: inherit;
  outline: none;
  transition: border-color var(--md-dur-short) var(--md-ease-standard);
}
.dlg-input:focus {
  border-color: var(--md-primary);
  box-shadow: inset 0 0 0 1px var(--md-primary);
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
