<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{ icon?: string; size?: number }>(), { icon: '', size: 18 })
const isImage = computed(() => /^(https?:\/\/|\/(?!\/))/.test(props.icon))
</script>

<template>
  <span class="notif-glyph" :style="{ width: size + 14 + 'px', height: size + 14 + 'px' }">
    <img v-if="isImage" :src="icon" alt="" />
    <AppIcon v-else :name="icon || 'notifications'" :size="size" />
  </span>
</template>

<style scoped>
.notif-glyph {
  display: inline-grid;
  place-items: center;
  flex: none;
  overflow: hidden;
  border-radius: var(--md-shape-md);
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
}
.notif-glyph img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
