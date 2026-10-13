<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ open: boolean; title?: string; wide?: boolean; closeOnScrim?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close')
}
function onScrim() {
  if (props.closeOnScrim !== false) emit('close')
}

onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <teleport to="body">
    <transition name="dialog">
      <div v-if="open" class="scrim" @click.self="onScrim">
        <div class="dialog" :class="{ 'dialog-wide': wide }" role="dialog" aria-modal="true">
          <header class="dialog-head">
            <h2 class="dialog-title">{{ title }}</h2>
            <button class="icon-btn" @click="emit('close')">
              <AppIcon name="close" :size="22" />
            </button>
          </header>
          <div class="dialog-content">
            <slot />
          </div>
          <div v-if="$slots.actions" class="dialog-actions">
            <slot name="actions" />
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.dialog-content {
  max-height: 62vh;
  overflow: auto;
  padding-right: 2px;
}
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity var(--md-dur-medium) var(--md-ease-standard);
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
</style>
