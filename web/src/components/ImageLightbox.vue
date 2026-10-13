<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ open: boolean; images: string[]; index: number }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'update:index', value: number): void }>()

function prev() {
  if (props.images.length < 2) return
  emit('update:index', (props.index - 1 + props.images.length) % props.images.length)
}
function next() {
  if (props.images.length < 2) return
  emit('update:index', (props.index + 1) % props.images.length)
}
function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowLeft') prev()
  else if (e.key === 'ArrowRight') next()
}

onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <teleport to="body">
    <transition name="lb">
      <div v-if="open" class="lightbox" @click.self="emit('close')">
        <button class="lb-close" @click="emit('close')">
          <AppIcon name="close" :size="26" />
        </button>
        <button v-if="images.length > 1" class="lb-nav prev" @click.stop="prev">
          <AppIcon name="chevron_right" :size="30" class="flip" />
        </button>
        <img class="lb-img" :src="images[index]" alt="" @click.stop />
        <button v-if="images.length > 1" class="lb-nav next" @click.stop="next">
          <AppIcon name="chevron_right" :size="30" />
        </button>
        <div v-if="images.length > 1" class="lb-count">{{ index + 1 }} / {{ images.length }}</div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 0.92);
  animation: fade-in var(--md-dur-medium) var(--md-ease-standard);
}
.lb-img {
  max-width: 92vw;
  max-height: 86vh;
  object-fit: contain;
  border-radius: var(--md-shape-sm);
  box-shadow: var(--md-elev-4);
}
.lb-close {
  position: absolute;
  top: 20px;
  right: 20px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: var(--md-shape-full);
  background: rgb(255 255 255 / 0.14);
  color: #fff;
  cursor: pointer;
  transition: background-color var(--md-dur-short) var(--md-ease-standard);
}
.lb-close:hover {
  background: rgb(255 255 255 / 0.26);
}
.lb-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: none;
  border-radius: var(--md-shape-full);
  background: rgb(255 255 255 / 0.14);
  color: #fff;
  cursor: pointer;
  transition: background-color var(--md-dur-short) var(--md-ease-standard);
}
.lb-nav:hover {
  background: rgb(255 255 255 / 0.26);
}
.lb-nav.prev {
  left: 20px;
}
.lb-nav.next {
  right: 20px;
}
.flip {
  transform: rotate(180deg);
}
.lb-count {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: var(--md-shape-full);
  background: rgb(0 0 0 / 0.5);
  color: #fff;
  font-size: 0.82rem;
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
}
.lb-enter-active,
.lb-leave-active {
  transition: opacity var(--md-dur-short) var(--md-ease-standard);
}
.lb-enter-from,
.lb-leave-to {
  opacity: 0;
}
</style>
