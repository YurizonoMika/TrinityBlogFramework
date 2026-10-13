<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PluginView from './PluginView.vue'
import { plugins } from '@/lib/plugins'

const route = useRoute()

const active = computed(() =>
  plugins.list.flatMap((plugin) =>
    (plugin.overlays || [])
      .filter((o) => o.pages.includes('*') || o.pages.includes(String(route.name)))
      .map((overlay) => ({ plugin, overlay }))
  )
)
</script>

<template>
  <div class="plugin-overlays">
    <PluginView
      v-for="a in active"
      :key="`${a.plugin.id}-${a.overlay.id}`"
      :plugin="a.plugin"
      kind="overlay"
      :id="a.overlay.id"
    />
  </div>
</template>

<style scoped>
.plugin-overlays {
  display: contents;
}
</style>
