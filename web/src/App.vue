<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import TopAppBar from './components/TopAppBar.vue'
import ToastHost from './components/ToastHost.vue'
import CommandPalette from './components/CommandPalette.vue'
import CreditsDialog from './components/CreditsDialog.vue'
import PluginOverlay from './components/PluginOverlay.vue'
import AppIcon from './components/AppIcon.vue'
import { auth } from '@/stores/auth'
import { loadPublicSite, applyTheme, site } from '@/stores/site'
import { loadPlugins } from '@/lib/plugins'

const route = useRoute()
const creditsOpen = ref(false)
const showChrome = computed(() => route.name !== 'setup' && route.name !== 'login')
const showFab = computed(
  () => auth.user && (route.name === 'home' || route.name === 'blog')
)

onMounted(async () => {
  applyTheme()
  loadPlugins()
  try {
    await loadPublicSite()
  } catch {
    /* server not reachable yet */
  }
})

watch(
  () => auth.user,
  () => {
    loadPublicSite().catch(() => {})
    loadPlugins()
  }
)

watch(
  () => site.site.accent,
  () => applyTheme()
)
</script>

<template>
  <div class="app-shell">
    <TopAppBar v-if="showChrome" />

    <main class="app-main">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <footer v-if="showChrome" class="app-footer">
      <div class="md-container">
        <span class="md-muted">
          {{ site.site.footer || `© ${new Date().getFullYear()} ${site.site.title || '我的主页'}` }}
        </span>
        <button class="powered credits-trigger" title="查看版权与开源许可" @click="creditsOpen = true">
          Trinity Blog Framework
        </button>
      </div>
    </footer>

    <router-link v-if="showFab" to="/write" class="fab">
      <AppIcon name="edit" :size="22" />
      <span>写文章</span>
    </router-link>

    <ToastHost />
    <CommandPalette />
    <CreditsDialog :open="creditsOpen" @close="creditsOpen = false" />
    <PluginOverlay />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.app-footer {
  margin-top: auto;
  padding: 32px 0 40px;
  border-top: 1px solid color-mix(in srgb, var(--md-outline-variant) 60%, transparent);
}
.app-footer .md-container {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 0.82rem;
}
.powered {
  opacity: 0.8;
}
.credits-trigger {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 0.82rem;
  color: var(--md-on-surface-variant);
  cursor: pointer;
  transition: color var(--md-dur-short) var(--md-ease-standard);
}
.credits-trigger:hover {
  color: var(--md-primary);
  text-decoration: underline;
  opacity: 1;
}

.page-enter-active,
.page-leave-active {
  transition: opacity var(--md-dur-medium) var(--md-ease-standard),
    transform var(--md-dur-medium) var(--md-ease-emphasized);
}
.page-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
