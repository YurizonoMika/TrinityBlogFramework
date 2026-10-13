<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { Card } from '@/lib/types'

const props = defineProps<{
  card: Card
  editable?: boolean
  dragging?: boolean
  over?: boolean
}>()

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'remove'): void
  (e: 'toggle'): void
  (e: 'dragstart', ev: DragEvent): void
  (e: 'dragover', ev: DragEvent): void
  (e: 'drop', ev: DragEvent): void
  (e: 'dragend'): void
}>()

const TYPE_META: Record<string, { icon: string; label: string }> = {
  profile: { icon: 'person', label: '个人资料' },
  activity: { icon: 'history', label: '个人活动' },
  posts: { icon: 'article', label: '帖子列表' },
  markdown: { icon: 'edit', label: '自定义文本' },
  links: { icon: 'link', label: '链接集合' },
}
</script>

<template>
  <section
    class="card-shell"
    :class="{
      full: card.width === 'full',
      dragging,
      over,
      editing: editable,
      hidden: !card.visible,
    }"
    :draggable="editable"
    @dragstart="emit('dragstart', $event)"
    @dragover="emit('dragover', $event)"
    @drop="emit('drop', $event)"
    @dragend="emit('dragend')"
  >
    <header class="card-head">
      <span v-if="editable" class="drag-handle" title="拖动排序">
        <AppIcon name="drag" :size="20" />
      </span>
      <span class="head-icon" :class="`type-${card.type}`">
        <AppIcon :name="TYPE_META[card.type]?.icon || 'widgets'" :size="16" />
      </span>
      <h3 class="card-title">{{ card.title || TYPE_META[card.type]?.label }}</h3>
      <span v-if="!card.visible" class="badge hidden-badge">已隐藏</span>
      <div class="spacer" />
      <div v-if="editable" class="card-tools">
        <button
          class="icon-btn sm"
          :title="card.visible ? '隐藏卡片' : '显示卡片'"
          @click.stop="emit('toggle')"
        >
          <AppIcon :name="card.visible ? 'visibility' : 'visibility_off'" :size="18" />
        </button>
        <button class="icon-btn sm" title="编辑卡片" @click.stop="emit('edit')">
          <AppIcon name="edit" :size="18" />
        </button>
        <button class="icon-btn sm danger" title="删除卡片" @click.stop="emit('remove')">
          <AppIcon name="delete" :size="18" />
        </button>
      </div>
    </header>
    <div class="card-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.card-shell {
  grid-column: span 6;
  display: flex;
  flex-direction: column;
  background: var(--md-surface-container-low);
  border: 1px solid color-mix(in srgb, var(--md-outline-variant) 50%, transparent);
  border-radius: var(--md-shape-2xl);
  padding: 20px;
  min-width: 0;
  transition: box-shadow var(--md-dur-medium) var(--md-ease-standard),
    transform var(--md-dur-medium) var(--md-ease-expressive),
    border-color var(--md-dur-medium) var(--md-ease-standard),
    opacity var(--md-dur-medium) var(--md-ease-standard);
}
.card-shell.full {
  grid-column: span 12;
}
.card-shell.editing {
  cursor: grab;
}
.card-shell.dragging {
  opacity: 0.45;
  transform: scale(0.98);
}
.card-shell.over {
  border-color: var(--md-primary);
  box-shadow: 0 0 0 2px var(--md-primary);
}
.card-shell.hidden {
  opacity: 0.55;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  min-height: 32px;
}
.drag-handle {
  display: grid;
  place-items: center;
  color: var(--md-on-surface-variant);
  cursor: grab;
  margin-left: -6px;
}
.head-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--md-shape-sm);
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}
.head-icon.type-activity {
  background: var(--md-tertiary-container);
  color: var(--md-on-tertiary-container);
}
.head-icon.type-posts {
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
}
.card-title {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.spacer {
  flex: 1;
}
.card-tools {
  display: flex;
  gap: 2px;
}
.icon-btn.danger {
  color: var(--md-error);
}
.card-body {
  flex: 1;
  min-width: 0;
}
@media (max-width: 820px) {
  .card-shell {
    grid-column: span 12;
  }
}
</style>
