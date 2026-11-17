<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import NotificationActions from './NotificationActions.vue'
import NotificationGlyph from './NotificationGlyph.vue'
import { closePanel, notifications, togglePanel, unreadCount } from '@/stores/notifications'

const root = ref<HTMLElement | null>(null)

function onDocClick(event: MouseEvent) {
  if (!notifications.panelOpen) return
  if (root.value && !root.value.contains(event.target as Node)) closePanel()
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') closePanel()
}

function onActionDone(_id: number, kind: 'ack' | 'link' | 'action') {
  // Acknowledging one item should keep the list open for the rest; following a
  // link navigates away, so close the panel.
  if (kind === 'link') closePanel()
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="notif-wrap">
    <button
      class="icon-btn notif-bell"
      type="button"
      title="通知"
      aria-label="通知"
      :aria-expanded="notifications.panelOpen"
      @click.stop="togglePanel"
    >
      <AppIcon name="notifications" :size="20" />
      <span v-if="unreadCount" class="notif-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
    </button>

    <transition name="notif-panel">
      <div v-if="notifications.panelOpen" class="notif-panel" @click.stop>
        <header class="notif-panel-head">
          <div>
            <span class="notif-eyebrow">NOTIFICATIONS</span>
            <strong>通知中心</strong>
          </div>
          <span class="notif-total">{{ unreadCount }} 未读</span>
        </header>

        <div v-if="!notifications.items.length" class="notif-empty">暂无未读通知</div>
        <div v-else class="notif-list">
          <article v-for="item in notifications.items" :key="item.id" class="notif-row">
            <NotificationGlyph :icon="item.icon" :size="18" />
            <div class="notif-body">
              <div class="notif-title">{{ item.title }}</div>
              <div v-if="item.content" class="notif-content">{{ item.content }}</div>
              <NotificationActions :notification="item" @done="onActionDone" />
            </div>
          </article>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.notif-wrap {
  position: relative;
  display: inline-flex;
}
.notif-bell {
  position: relative;
}
.notif-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--md-shape-full);
  background: var(--md-primary);
  color: var(--md-on-primary);
  font-size: 0.62rem;
  font-weight: 800;
  line-height: 16px;
  text-align: center;
  box-shadow: 0 0 0 2px var(--md-surface);
}
.notif-panel {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  z-index: 96;
  width: min(390px, calc(100vw - 24px));
  max-height: min(70vh, 580px);
  overflow: auto;
  padding: 16px;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--menu-radius);
  background: var(--md-surface-container-high);
  color: var(--md-on-surface);
  box-shadow: var(--md-elev-3);
}
.notif-panel-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--md-outline-variant);
}
.notif-panel-head strong {
  display: block;
  font-size: 1.05rem;
}
.notif-eyebrow {
  display: block;
  margin-bottom: 2px;
  color: var(--md-on-surface-variant);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.notif-total {
  color: var(--md-on-surface-variant);
  font-size: 0.75rem;
}
.notif-empty {
  padding: 32px 8px 18px;
  color: var(--md-on-surface-variant);
  font-size: 0.86rem;
  text-align: center;
}
.notif-list {
  display: flex;
  flex-direction: column;
}
.notif-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--md-outline-variant);
}
.notif-row:last-child {
  border-bottom: 0;
  padding-bottom: 2px;
}
.notif-body {
  min-width: 0;
  flex: 1;
}
.notif-title {
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.4;
}
.notif-content {
  margin-top: 4px;
  color: var(--md-on-surface-variant);
  font-size: 0.82rem;
  line-height: 1.6;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.notif-panel-enter-active,
.notif-panel-leave-active {
  transition: opacity var(--md-dur-short) var(--md-ease-standard),
    transform var(--md-dur-short) var(--md-ease-standard);
}
.notif-panel-enter-from,
.notif-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 640px) {
  .notif-panel {
    position: fixed;
    top: 72px;
    left: 12px;
    right: 12px;
    width: auto;
    max-height: calc(100vh - 88px);
  }
}
</style>
