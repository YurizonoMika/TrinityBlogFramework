<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { LinkItem } from '@/lib/types'

defineProps<{ links?: LinkItem[] }>()
</script>

<template>
  <div v-if="links?.length" class="links">
    <a
      v-for="link in links"
      :key="link.url"
      class="link-item"
      :href="link.url"
      target="_blank"
      rel="noopener"
    >
      <span class="link-icon"><AppIcon :name="link.icon || 'link'" :size="20" /></span>
      <span class="link-label">{{ link.label }}</span>
      <AppIcon class="link-out" name="open_in_new" :size="16" />
    </a>
  </div>
  <p v-else class="md-muted">尚未添加链接。</p>
</template>

<style scoped>
.links {
  display: grid;
  gap: 8px;
}
.link-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--md-shape-lg);
  background: var(--md-surface-container-high);
  color: var(--md-on-surface);
  text-decoration: none;
  transition: transform var(--md-dur-short) var(--md-ease-expressive),
    background-color var(--md-dur-short) var(--md-ease-standard);
}
.link-item:hover {
  transform: translateX(4px);
  text-decoration: none;
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}
.link-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--md-shape-sm);
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
  flex: none;
}
.link-label {
  flex: 1;
  font-weight: 600;
}
.link-out {
  opacity: 0.5;
}
</style>
