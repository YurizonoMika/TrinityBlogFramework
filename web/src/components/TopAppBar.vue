<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import PluginView from './PluginView.vue'
import { auth, logout, can } from '@/stores/auth'
import { site, toggleTheme } from '@/stores/site'
import { openPalette } from '@/stores/palette'
import { plugins } from '@/lib/plugins'
import { usePageOwner } from '@/lib/scope'

const route = useRoute()
const router = useRouter()

const accountOpen = ref(false)
const mobileOpen = ref(false)
const accountRef = ref<HTMLElement | null>(null)

// dynamic nav collapse: if the nav can't fit on one line, show a menu instead
const topbarInner = ref<HTMLElement | null>(null)
const navMeasure = ref<HTMLElement | null>(null)
const brandRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLElement | null>(null)
const actionsRef = ref<HTMLElement | null>(null)
const topbarCenterRef = ref<HTMLElement | null>(null)
const collapsed = ref(false)
const topbarWidth = ref(0) // cached natural width of plugin topbar components
let resizeObserver: ResizeObserver | null = null

const title = computed(() => site.site.title || '我的主页')
const logo = computed(() => site.site.icon || '/favicon.svg')
const topbarPlugins = computed(() =>
  plugins.list.flatMap((p) => (p.topbars || []).map((tb) => ({ plugin: p, topbar: tb })))
)
const pluginPages = computed(() =>
  plugins.list.flatMap((p) =>
    (p.pages || []).map((pg) => ({ path: `/p/${p.id}/${pg.id}`, title: pg.title, icon: pg.icon || 'extension' }))
  )
)
// the user the current page is scoped to (params / query / account pages).
// The brand always links to the whole-site home.
const routeUsername = usePageOwner()
const navItems = computed(() => {
  const u = routeUsername.value
  const query = u ? { username: u } : {}
  const home = u ? `/user/${encodeURIComponent(u)}` : '/'
  return [
    { path: home, to: home, title: '首页', icon: 'home' },
    { path: '/blog', to: { path: '/blog', query }, title: '博客', icon: 'article' },
    { path: '/moments', to: { path: '/moments', query }, title: '动态', icon: 'chat' },
    ...pluginPages.value.map((p) => ({
      path: p.path,
      to: { path: p.path, query },
      title: p.title,
      icon: p.icon,
    })),
  ]
})
const initial = computed(() => {
  const name = auth.user?.display_name || auth.user?.username || 'A'
  return name.trim().charAt(0).toUpperCase()
})

function measure() {
  const bar = topbarInner.value
  const nav = navMeasure.value
  if (!bar || !nav) return
  const need = nav.offsetWidth
  if (!need) return
  // plugin topbar components are treated like nav items: they collapse together.
  // measure their natural width only while actually laid out (cache when hidden)
  const center = topbarCenterRef.value
  if (center && center.offsetParent !== null) topbarWidth.value = center.offsetWidth
  const others =
    (brandRef.value?.offsetWidth || 0) +
    (searchRef.value?.offsetWidth || 0) +
    (actionsRef.value?.offsetWidth || 0) +
    72
  collapsed.value = bar.clientWidth - others < need + topbarWidth.value
}

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

function onDocClick(e: MouseEvent) {
  if (accountRef.value && !accountRef.value.contains(e.target as Node)) {
    accountOpen.value = false
  }
}

function doLogout() {
  logout()
  accountOpen.value = false
  mobileOpen.value = false
  router.push('/')
}

watch(
  () => [navItems.value.length, title.value, topbarPlugins.value.length].join(),
  () => nextTick(measure)
)

onMounted(() => {
  document.addEventListener('click', onDocClick)
  if (typeof ResizeObserver !== 'undefined' && topbarInner.value) {
    resizeObserver = new ResizeObserver(() => measure())
    resizeObserver.observe(topbarInner.value)
    if (topbarCenterRef.value) resizeObserver.observe(topbarCenterRef.value)
  }
  window.addEventListener('resize', measure)
  nextTick(measure)
  // plugin topbar components may mount asynchronously — re-measure shortly after
  window.setTimeout(measure, 300)
  window.setTimeout(measure, 1200)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  resizeObserver?.disconnect()
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <header class="topbar">
    <div ref="topbarInner" class="md-container topbar-inner">
      <router-link ref="brandRef" class="brand" to="/" @click="mobileOpen = false">
        <img class="brand-logo" :src="logo" alt="" />
        <span class="brand-name">{{ title }}</span>
      </router-link>

      <nav v-show="!collapsed" class="nav">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.to"
          :class="{ active: isActive(item.path) }"
        >
          <AppIcon :name="item.icon" :size="18" /><span>{{ item.title }}</span>
        </router-link>
      </nav>

      <!-- hidden copy used to measure the nav's natural width -->
      <nav ref="navMeasure" class="nav nav-measure" aria-hidden="true">
        <a v-for="item in navItems" :key="item.path">
          <AppIcon :name="item.icon" :size="18" /><span>{{ item.title }}</span>
        </a>
      </nav>

      <div v-if="!collapsed" class="topbar-center">
        <div ref="topbarCenterRef" class="topbar-center-inner">
          <PluginView
            v-for="t in topbarPlugins"
            :key="`${t.plugin.id}-${t.topbar.id}`"
            :plugin="t.plugin"
            kind="topbar"
            :id="t.topbar.id"
          />
        </div>
      </div>

      <button ref="searchRef" class="search-trigger" type="button" @click="openPalette()">
        <AppIcon name="search" :size="18" />
        <span class="search-label">搜索与快捷指令</span>
        <kbd class="search-kbd">⌘K</kbd>
      </button>

      <div ref="actionsRef" class="actions">
        <button class="icon-btn" :title="site.theme === 'dark' ? '浅色模式' : '深色模式'" @click="toggleTheme">
          <AppIcon :name="site.theme === 'dark' ? 'light_mode' : 'dark_mode'" :size="20" />
        </button>

        <router-link v-if="auth.user && can('post')" to="/write" class="btn btn-tonal btn-sm write-btn">
          <AppIcon name="edit" :size="16" /><span>写文章</span>
        </router-link>

        <div v-if="auth.user" ref="accountRef" class="account">
          <button class="avatar-trigger" @click.stop="accountOpen = !accountOpen">
            <img v-if="auth.user.avatar" :src="auth.user.avatar" alt="" class="avatar sm" />
            <span v-else class="avatar sm">{{ initial }}</span>
          </button>
          <div v-if="accountOpen" class="menu account-menu">
            <div class="account-head">
              <strong>{{ auth.user.display_name || auth.user.username }}</strong>
              <span class="md-muted">@{{ auth.user.username }}</span>
            </div>
            <div class="menu-divider" />
            <router-link class="menu-item" :to="`/user/${auth.user.username}`" @click="accountOpen = false">
              <AppIcon name="person" :size="18" />我的主页
            </router-link>
            <router-link class="menu-item" to="/settings" @click="accountOpen = false">
              <AppIcon name="settings" :size="18" />用户设置
            </router-link>
            <router-link class="menu-item" to="/write" @click="accountOpen = false">
              <AppIcon name="add_box" :size="18" />新建帖子
            </router-link>
            <div class="menu-divider" />
            <button class="menu-item danger" @click="doLogout">
              <AppIcon name="logout" :size="18" />退出登录
            </button>
          </div>
        </div>

        <button v-show="collapsed" class="icon-btn mobile-toggle" @click="mobileOpen = !mobileOpen">
          <AppIcon :name="mobileOpen ? 'close' : 'menu'" :size="22" />
        </button>
      </div>
    </div>

    <transition name="drawer">
      <div v-if="collapsed && mobileOpen" class="mobile-nav md-container">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.to"
          :class="{ active: isActive(item.path) }"
          @click="mobileOpen = false"
        >
          <AppIcon :name="item.icon" :size="18" />{{ item.title }}
        </router-link>
        <router-link v-if="auth.user" to="/settings" @click="mobileOpen = false">
          <AppIcon name="settings" :size="18" />用户设置
        </router-link>
        <router-link v-if="auth.user && can('post')" to="/write" @click="mobileOpen = false">
          <AppIcon name="edit" :size="18" />写文章
        </router-link>
        <!-- plugin topbar components collapse into the menu too -->
        <div v-if="topbarPlugins.length" class="mobile-topbars">
          <PluginView
            v-for="t in topbarPlugins"
            :key="`m-${t.plugin.id}-${t.topbar.id}`"
            :plugin="t.plugin"
            kind="topbar"
            :id="t.topbar.id"
          />
        </div>
      </div>
    </transition>
  </header>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  background: color-mix(in srgb, var(--md-surface) 84%, transparent);
  backdrop-filter: blur(14px) saturate(1.3);
  border-bottom: 1px solid color-mix(in srgb, var(--md-outline-variant) 60%, transparent);
}
.topbar-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 68px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: var(--md-on-surface);
  font-weight: 700;
  font-size: 1.12rem;
  text-decoration: none;
  letter-spacing: -0.01em;
}
.brand:hover {
  text-decoration: none;
}
.brand-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.brand-logo {
  width: 38px;
  height: 38px;
  border-radius: var(--md-shape-md);
  object-fit: cover;
  flex: none;
  background: var(--md-surface-container-high);
  transition: border-radius var(--md-dur-medium) var(--md-ease-expressive);
}
.brand:hover .brand-logo {
  border-radius: var(--md-shape-full);
}
.nav {
  display: flex;
  flex: none;
  flex-wrap: nowrap;
  gap: 4px;
  margin-left: 18px;
  white-space: nowrap;
}
.nav-measure {
  position: absolute;
  top: 0;
  left: -99999px;
  visibility: hidden;
  pointer-events: none;
}
.nav a,
.mobile-nav a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
  padding: 0 16px;
  height: 40px;
  border-radius: var(--md-shape-full);
  color: var(--md-on-surface-variant);
  font-weight: 600;
  font-size: 0.92rem;
  text-decoration: none;
  white-space: nowrap;
  transition: background-color var(--md-dur-short) var(--md-ease-standard);
}
.nav a:hover,
.mobile-nav a:hover {
  background: color-mix(in srgb, var(--md-on-surface) 8%, transparent);
  text-decoration: none;
}
.nav a.active,
.mobile-nav a.active {
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}
.topbar-center {
  flex: 1 1 auto;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 0;
  padding: 0 6px;
}
.topbar-center-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  max-width: 100%;
}
.search-trigger {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 42px;
  padding: 0 14px;
  margin-right: 6px;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-full);
  background: var(--md-surface-container-high);
  color: var(--md-on-surface-variant);
  cursor: pointer;
  min-width: 240px;
  transition: background-color var(--md-dur-short) var(--md-ease-standard),
    border-color var(--md-dur-short) var(--md-ease-standard);
}
.search-trigger:hover {
  background: var(--md-surface-container-highest);
  border-color: var(--md-outline);
}
.search-label {
  flex: 1;
  text-align: left;
  font-size: 0.88rem;
}
.search-kbd {
  font-family: var(--md-font-mono);
  font-size: 0.72rem;
  padding: 2px 6px;
  border-radius: var(--md-shape-xs);
  background: var(--md-surface);
  border: 1px solid var(--md-outline-variant);
  color: var(--md-on-surface-variant);
}
.actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.account {
  position: relative;
}
.avatar-trigger {
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  display: grid;
  place-items: center;
  border-radius: var(--md-shape-full);
}
.account-menu {
  top: calc(100% + 8px);
  right: 0;
}
.account-head {
  display: flex;
  flex-direction: column;
  padding: 8px 14px 6px;
  gap: 2px;
}
.account-head span {
  font-size: 0.8rem;
}
.mobile-toggle {
  display: inline-grid;
}
.mobile-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 12px;
}
.mobile-nav a {
  width: 100%;
}
.mobile-topbars {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--md-outline-variant);
}
.mobile-topbars :deep(*) {
  max-width: 100%;
}

@media (max-width: 760px) {
  .write-btn {
    display: none;
  }
  .search-trigger {
    min-width: 0;
    width: 40px;
    padding: 0;
    justify-content: center;
    margin-right: 2px;
  }
  .search-label,
  .search-kbd {
    display: none;
  }
  .brand-name {
    max-width: 40vw;
  }
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity var(--md-dur-short) var(--md-ease-standard),
    transform var(--md-dur-short) var(--md-ease-standard);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
