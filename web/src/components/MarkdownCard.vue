<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/lib/markdown'

const props = defineProps<{ body?: string }>()
const html = computed(() => renderMarkdown(props.body || ''))
</script>

<template>
  <div v-if="body" class="md-body" v-html="html" />
  <p v-else class="md-muted">（空白卡片，点击编辑可写入 Markdown 内容）</p>
</template>

<style scoped>
.md-body {
  line-height: 1.75;
}
.md-body :deep(h1),
.md-body :deep(h2),
.md-body :deep(h3) {
  margin: 0.6em 0 0.4em;
  line-height: 1.25;
}
.md-body :deep(p) {
  margin: 0.6em 0;
  color: var(--md-on-surface-variant);
}
.md-body :deep(a) {
  font-weight: 500;
}
.md-body :deep(ul),
.md-body :deep(ol) {
  padding-left: 1.4em;
  color: var(--md-on-surface-variant);
}
.md-body :deep(blockquote) {
  margin: 0.8em 0;
  padding: 4px 16px;
  border-left: 3px solid var(--md-primary);
  color: var(--md-on-surface-variant);
}
.md-body :deep(img) {
  border-radius: var(--md-shape-md);
}
</style>
