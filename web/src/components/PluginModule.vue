<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed } from 'vue'
import PluginView from './PluginView.vue'
import { findPlugin } from '@/lib/plugins'

const props = defineProps<{ pluginId: string; moduleId: string; moduleProps?: unknown }>()
const plugin = computed(() => findPlugin(props.pluginId))
</script>

<template>
  <div class="plugin-module">
    <PluginView
      v-if="plugin"
      :plugin="plugin"
      :data="moduleProps || {}"
      kind="module"
      :id="moduleId"
      :title="plugin.postModules.find((m) => m.id === moduleId)?.title || plugin.name"
    />
    <div v-else class="plugin-module-missing md-muted">插件「{{ pluginId }}」不可用</div>
  </div>
</template>

<style scoped>
.plugin-module {
  margin: 1.2em 0;
}
.plugin-module-missing {
  padding: 12px;
  border: 1px dashed var(--md-outline-variant);
  border-radius: var(--md-shape-md);
  font-size: 0.85rem;
}
</style>
