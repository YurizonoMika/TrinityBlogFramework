<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PluginView from '@/components/PluginView.vue'
import { findPlugin } from '@/lib/plugins'

const route = useRoute()
const plugin = computed(() => findPlugin(String(route.params.plugin)))
const page = computed(() => plugin.value?.pages.find((p) => p.id === String(route.params.page)))
</script>

<template>
  <div class="plugin-page md-container">
    <template v-if="plugin && page">
      <header class="plugin-page-head">
        <span class="md-label">PLUGIN</span>
        <h1 class="md-headline">{{ page.title }}</h1>
      </header>
      <PluginView :plugin="plugin" kind="page" :id="page.id" :title="page.title" />
    </template>
    <div v-else class="empty-state">
      <p>页面不存在，或插件未启用</p>
      <router-link to="/" class="btn btn-tonal">返回首页</router-link>
    </div>
  </div>
</template>

<style scoped>
.plugin-page {
  padding: var(--section-space, 40px) 0 clamp(48px, 10vw, 96px);
}
.plugin-page-head {
  margin-bottom: 24px;
}
.plugin-page-head h1 {
  margin-top: 2px;
}
</style>
