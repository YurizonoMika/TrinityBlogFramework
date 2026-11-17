<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import NotificationActions from './NotificationActions.vue'
import NotificationGlyph from './NotificationGlyph.vue'
import { dismissBanner, notifications } from '@/stores/notifications'

const DURATION = 5000
const current = computed(() => notifications.banner)
const paused = ref(false)
let timer: number | null = null
let remaining = DURATION
let startedAt = 0

function clearTimer() {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
}

function expire() {
  const id = current.value?.id
  if (id != null) dismissBanner(id)
}

function start() {
  if (!current.value || paused.value) return
  clearTimer()
  startedAt = Date.now()
  timer = window.setTimeout(expire, remaining)
}

function pause() {
  if (paused.value) return
  paused.value = true
  if (timer !== null) {
    remaining = Math.max(0, remaining - (Date.now() - startedAt))
    clearTimer()
  }
}

function resume() {
  if (!paused.value) return
  paused.value = false
  if (remaining <= 0) expire()
  else start()
}

function dismissCurrent() {
  const id = current.value?.id
  if (id != null) dismissBanner(id)
}

watch(
  current,
  (value) => {
    clearTimer()
    remaining = DURATION
    paused.value = false
    if (value) start()
  },
  { immediate: true }
)

onUnmounted(clearTimer)
</script>

<template>
  <teleport to="body">
    <transition name="notif-banner">
      <aside
        v-if="current"
        class="notif-banner"
        role="status"
        aria-live="polite"
        @mouseenter="pause"
        @mouseleave="resume"
        @focusin="pause"
        @focusout="resume"
      >
        <div class="notif-banner-head">
          <NotificationGlyph :icon="current.icon" :size="20" />
          <div class="notif-banner-title">{{ current.title }}</div>
          <button class="icon-btn sm notif-dismiss" type="button" title="收进通知中心" @click="dismissCurrent">
            <AppIcon name="close" :size="16" />
          </button>
        </div>
        <div v-if="current.content" class="notif-banner-content">{{ current.content }}</div>
        <NotificationActions :notification="current" @done="dismissBanner" />
      </aside>
    </transition>
  </teleport>
</template>

<style scoped>
.notif-banner {
  position: fixed;
  top: 84px;
  right: 24px;
  z-index: 9500;
  width: min(390px, calc(100vw - 32px));
  max-height: min(60vh, 560px);
  overflow: auto;
  padding: 16px;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-2xl);
  background: var(--md-surface-container-high);
  color: var(--md-on-surface);
  box-shadow: var(--md-elev-4);
}
.notif-banner-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.notif-banner-title {
  flex: 1;
  min-width: 0;
  padding-top: 4px;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.4;
}
.notif-dismiss {
  margin: -4px -4px 0 0;
  color: var(--md-on-surface-variant);
}
.notif-banner-content {
  margin-top: 10px;
  color: var(--md-on-surface-variant);
  font-size: 0.85rem;
  line-height: 1.65;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.notif-banner-enter-active,
.notif-banner-leave-active {
  transition: opacity var(--md-dur-medium) var(--md-ease-standard),
    transform var(--md-dur-medium) var(--md-ease-expressive);
}
.notif-banner-enter-from,
.notif-banner-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.98);
}
@media (max-width: 640px) {
  .notif-banner {
    top: 76px;
    right: 12px;
    width: calc(100vw - 24px);
  }
}
</style>
