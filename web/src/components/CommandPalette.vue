<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { api } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { auth, logout } from '@/stores/auth'
import { site, toggleTheme } from '@/stores/site'
import { closePalette, paletteOpen } from '@/stores/palette'
import type { Moment, Post } from '@/lib/types'

const router = useRouter()
const query = ref('')
const posts = ref<Post[]>([])
const moments = ref<Moment[]>([])
const loaded = ref(false)
const loading = ref(false)
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const RESULT_LIMIT = 3

interface Item {
  kind: 'command' | 'post' | 'moment'
  group: string
  icon: string
  label: string
  sub?: string
  run: () => void
}

function go(path: string) {
  router.push(path)
}

const commands = computed<Item[]>(() => {
  const list: Item[] = [
    { kind: 'command', group: '命令', icon: 'home', label: '前往首页', sub: 'home', run: () => go('/') },
    { kind: 'command', group: '命令', icon: 'article', label: '前往博客', sub: 'blog', run: () => go('/blog') },
    { kind: 'command', group: '命令', icon: 'chat', label: '前往动态', sub: 'moments', run: () => go('/moments') },
  ]
  if (auth.user) {
    list.push({ kind: 'command', group: '命令', icon: 'edit', label: '写新文章', sub: 'write', run: () => go('/write') })
    list.push({ kind: 'command', group: '命令', icon: 'settings', label: '用户设置', sub: 'settings', run: () => go('/settings') })
    list.push({ kind: 'command', group: '命令', icon: 'palette', label: '站点外观 / 动态取色', sub: 'theme appearance', run: () => go('/settings?tab=site') })
  }
  list.push({
    kind: 'command',
    group: '命令',
    icon: site.theme === 'dark' ? 'light_mode' : 'dark_mode',
    label: site.theme === 'dark' ? '切换到浅色模式' : '切换到深色模式',
    sub: 'theme dark light',
    run: () => toggleTheme(),
  })
  if (auth.user) {
    list.push({
      kind: 'command',
      group: '命令',
      icon: 'logout',
      label: '退出登录',
      sub: 'logout',
      run: () => {
        logout()
        go('/')
      },
    })
  }
  return list
})

const filteredPosts = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q
    ? posts.value.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.summary.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      )
    : posts.value
  return list.slice(0, RESULT_LIMIT)
})

const filteredMoments = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q ? moments.value.filter((m) => m.content.toLowerCase().includes(q)) : moments.value
  return list.slice(0, RESULT_LIMIT)
})

function truncate(text: string, n = 42): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

const results = computed<Item[]>(() => {
  const q = query.value.trim().toLowerCase()
  const cmds = commands.value.filter(
    (c) => !q || c.label.toLowerCase().includes(q) || (c.sub || '').toLowerCase().includes(q)
  )
  const postItems: Item[] = filteredPosts.value.map((p) => ({
    kind: 'post',
    group: '文章',
    icon: 'article',
    label: p.title,
    sub: p.tags.map((t) => `#${t}`).join(' '),
    run: () => go(`/blog/${p.slug}`),
  }))
  const momentItems: Item[] = filteredMoments.value.map((m) => ({
    kind: 'moment',
    group: '动态',
    icon: 'chat',
    label: truncate(m.content) || '（图片动态）',
    sub: formatRelative(m.created_at),
    run: () => go(`/moments?m=${m.id}`),
  }))
  return [...cmds, ...postItems, ...momentItems]
})

const activeItem = computed(() => results.value[activeIndex.value] || null)

watch(query, () => {
  activeIndex.value = 0
})

watch(results, () => {
  if (activeIndex.value >= results.value.length) activeIndex.value = 0
})

async function loadData() {
  if (loaded.value || loading.value) return
  loading.value = true
  try {
    const [p, m] = await Promise.all([
      api<{ posts: Post[] }>('/posts?limit=200', { auth: false }),
      api<{ moments: Moment[] }>('/moments?limit=200', { auth: false }),
    ])
    posts.value = p.posts
    moments.value = m.moments
    loaded.value = true
  } catch {
    /* ignore */
  } finally {
    loading.value = false
  }
}

function run(item: Item | null) {
  if (!item) return
  closePalette()
  item.run()
}

function onKeydown(e: KeyboardEvent) {
  if (!paletteOpen.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    closePalette()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, results.value.length - 1)
    scrollActive()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
    scrollActive()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    run(activeItem.value)
  }
}

function globalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    paletteOpen.value = !paletteOpen.value
  }
}

function scrollActive() {
  nextTick(() => {
    document.getElementById(`palette-item-${activeIndex.value}`)?.scrollIntoView({ block: 'nearest' })
  })
}

function initOpen() {
  query.value = ''
  activeIndex.value = 0
  loadData()
  nextTick(() => inputRef.value?.focus())
}

onMounted(() => {
  window.addEventListener('keydown', globalKeydown)
  window.addEventListener('keydown', onKeydown)
  if (paletteOpen.value) initOpen()
})
onUnmounted(() => {
  window.removeEventListener('keydown', globalKeydown)
  window.removeEventListener('keydown', onKeydown)
})

watch(paletteOpen, (v) => {
  if (v) initOpen()
})
</script>

<template>
  <teleport to="body">
    <transition name="palette">
      <div v-if="paletteOpen" class="palette-scrim" @click.self="closePalette">
        <div class="palette" role="dialog" aria-modal="true">
          <div class="palette-input">
            <AppIcon name="search" :size="20" />
            <input
              ref="inputRef"
              v-model="query"
              placeholder="搜索文章或输入指令…"
            />
            <button class="icon-btn sm" @click="closePalette">
              <AppIcon name="close" :size="18" />
            </button>
          </div>

          <div class="palette-body">
            <template v-if="results.length">
              <template v-for="(item, i) in results" :key="`${item.group}-${i}`">
                <div v-if="i === 0 || results[i - 1].group !== item.group" class="palette-group">
                  {{ item.group }}
                </div>
                <button
                  :id="`palette-item-${i}`"
                  class="palette-item"
                  :class="{ active: i === activeIndex }"
                  @mouseenter="activeIndex = i"
                  @click="run(item)"
                >
                  <span class="palette-icon"><AppIcon :name="item.icon" :size="18" /></span>
                  <span class="palette-label">{{ item.label }}</span>
                  <span v-if="item.sub" class="palette-sub">{{ item.sub }}</span>
                  <AppIcon v-if="i === activeIndex" class="palette-enter" name="chevron_right" :size="16" />
                </button>
              </template>
            </template>
            <div v-else class="palette-empty">
              <AppIcon name="search" :size="28" />
              <p>{{ loading ? '加载中…' : '没有找到匹配的结果' }}</p>
            </div>
          </div>

          <div class="palette-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
            <span><kbd>Enter</kbd> 执行</span>
            <span><kbd>Esc</kbd> 关闭</span>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.palette-scrim {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 16px 16px;
  background: var(--md-scrim);
}
.palette {
  width: min(640px, 100%);
  max-height: min(72vh, 620px);
  display: flex;
  flex-direction: column;
  background: var(--md-surface-container-high);
  border-radius: var(--md-shape-2xl);
  box-shadow: var(--md-elev-5);
  overflow: hidden;
  animation: palette-in var(--md-dur-medium) var(--md-ease-expressive);
}
@keyframes palette-in {
  from {
    opacity: 0;
    transform: translateY(-14px) scale(0.97);
  }
}
.palette-input {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--md-outline-variant);
  color: var(--md-on-surface-variant);
}
.palette-input input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 1.05rem;
  color: var(--md-on-surface);
}
.palette-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.palette-group {
  padding: 10px 12px 4px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--md-on-surface-variant);
}
.palette-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 12px;
  border: none;
  background: transparent;
  border-radius: var(--md-shape-md);
  color: var(--md-on-surface);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--md-dur-short) var(--md-ease-standard);
}
.palette-item.active {
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}
.palette-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--md-shape-sm);
  background: var(--md-surface-container-highest);
  color: var(--md-primary);
  flex: none;
}
.palette-item.active .palette-icon {
  background: color-mix(in srgb, var(--md-on-secondary-container) 12%, transparent);
  color: var(--md-on-secondary-container);
}
.palette-label {
  flex: 1;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.palette-sub {
  font-size: 0.76rem;
  color: var(--md-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40%;
}
.palette-item.active .palette-sub {
  color: inherit;
  opacity: 0.8;
}
.palette-enter {
  opacity: 0.7;
  flex: none;
}
.palette-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 16px;
  color: var(--md-on-surface-variant);
}
.palette-foot {
  display: flex;
  gap: 18px;
  padding: 10px 18px;
  border-top: 1px solid var(--md-outline-variant);
  font-size: 0.74rem;
  color: var(--md-on-surface-variant);
  flex-wrap: wrap;
}
.palette-foot kbd {
  font-family: var(--md-font-mono);
  font-size: 0.7rem;
  padding: 1px 5px;
  margin-right: 3px;
  border-radius: var(--md-shape-xs);
  background: var(--md-surface-container-highest);
  border: 1px solid var(--md-outline-variant);
}

.palette-enter-active,
.palette-leave-active {
  transition: opacity var(--md-dur-short) var(--md-ease-standard);
}
.palette-enter-from,
.palette-leave-to {
  opacity: 0;
}
</style>
