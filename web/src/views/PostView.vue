<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import BaseDialog from '@/components/BaseDialog.vue'
import PluginModule from '@/components/PluginModule.vue'
import { api } from '@/lib/api'
import { renderMarkdown } from '@/lib/markdown'
import { formatDate, readingTime } from '@/lib/format'
import { auth } from '@/stores/auth'
import { notify } from '@/stores/toast'
import { useParallax } from '@/lib/useParallax'
import type { Post } from '@/lib/types'

const route = useRoute()
const router = useRouter()
const post = ref<Post | null>(null)
const loading = ref(true)
const notFound = ref(false)
const confirmOpen = ref(false)

const MODULE_RE = /\[\[plugin:([a-z0-9-]+)\/([\w-]+)(?:\|(\{[\s\S]*?\}))?\]\]/g

const segments = computed(() => {
  const content = post.value?.content || ''
  const out: (
    | { type: 'md'; html: string }
    | { type: 'module'; pluginId: string; moduleId: string; props: unknown }
  )[] = []
  let last = 0
  let match: RegExpExecArray | null
  MODULE_RE.lastIndex = 0
  while ((match = MODULE_RE.exec(content))) {
    if (match.index > last) {
      out.push({ type: 'md', html: renderMarkdown(content.slice(last, match.index)) })
    }
    let props: unknown = null
    if (match[3]) {
      try {
        props = JSON.parse(match[3])
      } catch {
        props = null
      }
    }
    out.push({ type: 'module', pluginId: match[1], moduleId: match[2], props })
    last = match.index + match[0].length
  }
  if (last < content.length) {
    out.push({ type: 'md', html: renderMarkdown(content.slice(last)) })
  }
  return out
})
const authorInitial = computed(() =>
  (post.value?.author_name || post.value?.author_username || 'A').trim().charAt(0).toUpperCase()
)

const coverRef = ref<HTMLElement | null>(null)
const { update: updateParallax } = useParallax(coverRef, 0.3, 140)

async function load() {
  loading.value = true
  notFound.value = false
  try {
    const res = await api<{ post: Post }>(`/posts/${route.params.slug}`)
    post.value = res.post
    await nextTick()
    updateParallax()
  } catch (e: any) {
    notFound.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => route.params.slug, load)

async function toggleStatus() {
  if (!post.value) return
  const next = post.value.status === 'published' ? 'hidden' : 'published'
  try {
    const res = await api<{ post: Post }>(`/posts/${post.value.id}/status`, {
      method: 'PATCH',
      body: { status: next },
    })
    post.value = res.post
    notify(next === 'published' ? '帖子已公开' : '帖子已隐藏', 'success')
  } catch (e: any) {
    notify(e.message || '操作失败', 'error')
  }
}

async function doDelete() {
  if (!post.value) return
  try {
    await api(`/posts/${post.value.id}`, { method: 'DELETE' })
    notify('帖子已删除', 'success')
    router.push('/blog')
  } catch (e: any) {
    notify(e.message || '删除失败', 'error')
  }
}
</script>

<template>
  <div class="post-view">
    <div v-if="loading" class="md-container loading-wrap">
      <div class="skeleton" style="height: 40px; width: 60%; margin-bottom: 16px" />
      <div class="skeleton" style="height: 300px; border-radius: 24px" />
    </div>

    <div v-else-if="notFound" class="md-container">
      <div class="empty-state">
        <AppIcon name="article" :size="40" />
        <h2 class="md-headline">文章不存在</h2>
        <p>它可能已被删除或隐藏。</p>
        <router-link to="/blog" class="btn btn-tonal"><AppIcon name="arrow_back" :size="16" />返回博客</router-link>
      </div>
    </div>

    <template v-else-if="post">
      <header class="post-hero">
        <div
          v-if="post.cover"
          ref="coverRef"
          class="hero-bg"
          :style="{ backgroundImage: `url('${post.cover}')` }"
        />
        <div class="hero-scrim" />
        <div class="md-container hero-inner">
          <router-link to="/blog" class="back-link">
            <AppIcon name="arrow_back" :size="18" />返回博客
          </router-link>
          <div class="post-meta-top">
            <span v-if="post.category" class="category-badge">{{ post.category }}</span>
            <span v-if="post.status !== 'published'" class="badge hidden-badge">{{ post.status === 'draft' ? '草稿' : '已隐藏' }}</span>
            <time>{{ formatDate(post.created_at) }}</time>
            <span>· {{ readingTime(post.content) }} 分钟阅读</span>
            <span>· {{ post.views }} 次浏览</span>
          </div>
          <h1 class="md-display post-title">{{ post.title }}</h1>
          <div class="author-row">
            <img v-if="post.author_avatar" class="avatar sm" :src="post.author_avatar" alt="" />
            <span v-else class="avatar sm">{{ authorInitial }}</span>
            <router-link v-if="post.author_username" :to="`/user/${post.author_username}`">
              {{ post.author_name || post.author_username }}
            </router-link>
            <span v-else>{{ post.author_name || '匿名' }}</span>
          </div>

          <div v-if="auth.user" class="post-controls">
            <router-link :to="`/write/${post.id}`" class="btn btn-tonal btn-sm">
              <AppIcon name="edit" :size="16" />编辑
            </router-link>
            <button class="btn btn-outlined btn-sm" @click="toggleStatus">
              <AppIcon :name="post.status === 'published' ? 'visibility_off' : 'visibility'" :size="16" />
              {{ post.status === 'published' ? '隐藏' : '公开' }}
            </button>
            <button class="btn btn-danger btn-sm" @click="confirmOpen = true">
              <AppIcon name="delete" :size="16" />删除
            </button>
          </div>
        </div>
      </header>

      <article class="md-container post-body">
        <template v-for="(seg, i) in segments" :key="i">
          <div v-if="seg.type === 'md'" class="md-content" v-html="seg.html" />
          <PluginModule
            v-else
            :plugin-id="seg.pluginId"
            :module-id="seg.moduleId"
            :module-props="seg.props"
          />
        </template>
        <div v-if="post.tags.length" class="post-tags">
          <span v-for="t in post.tags" :key="t" class="chip static">#{{ t }}</span>
        </div>
        <div class="post-end">
          <router-link to="/blog" class="btn btn-tonal">
            <AppIcon name="arrow_back" :size="16" />更多文章
          </router-link>
        </div>
      </article>
    </template>

    <BaseDialog :open="confirmOpen" title="删除文章" @close="confirmOpen = false">
      <p>确定要删除「{{ post?.title }}」吗？此操作无法撤销。</p>
      <template #actions>
        <button class="btn" @click="confirmOpen = false">取消</button>
        <button class="btn btn-danger" @click="doDelete"><AppIcon name="delete" :size="16" />删除</button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.loading-wrap {
  padding: 60px 0;
}
.post-hero {
  position: relative;
  overflow: hidden;
  padding: clamp(48px, 8vw, 88px) 0 clamp(40px, 6vw, 64px);
  background: linear-gradient(135deg, var(--md-primary-container), var(--md-tertiary-container)) center/cover no-repeat;
  color: var(--md-on-primary-container);
}
.hero-bg {
  position: absolute;
  left: 0;
  right: 0;
  top: -28%;
  bottom: -28%;
  background-size: cover;
  background-position: center;
  z-index: 0;
  will-change: transform;
}
.hero-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, color-mix(in srgb, var(--md-surface) 8%, transparent), color-mix(in srgb, var(--md-surface) 55%, transparent));
}
.hero-inner {
  position: relative;
  z-index: 2;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: inherit;
  font-size: 0.86rem;
  font-weight: 600;
  opacity: 0.85;
  margin-bottom: 24px;
}
.back-link:hover {
  text-decoration: none;
  opacity: 1;
}
.post-meta-top {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.82rem;
  opacity: 0.85;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.category-badge {
  padding: 1px 10px;
  border-radius: var(--md-shape-full);
  background: rgb(255 255 255 / 0.22);
  color: inherit;
  font-weight: 700;
  font-size: 0.74rem;
}
.post-title {
  max-width: 20ch;
  margin-bottom: 20px;
}
.author-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
}
.post-controls {
  display: flex;
  gap: 8px;
  margin-top: 24px;
  flex-wrap: wrap;
}
.post-body {
  padding: clamp(32px, 6vw, 56px) 0 clamp(48px, 10vw, 96px);
  max-width: 800px;
}
.md-content {
  font-size: 1.05rem;
  line-height: 1.85;
}
.md-content :deep(h1),
.md-content :deep(h2),
.md-content :deep(h3) {
  margin: 1.6em 0 0.6em;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
.md-content :deep(h2) {
  font-size: 1.6rem;
}
.md-content :deep(h3) {
  font-size: 1.25rem;
}
.md-content :deep(p) {
  margin: 1em 0;
}
.md-content :deep(a) {
  color: var(--md-primary);
  font-weight: 500;
}
.md-content :deep(ul),
.md-content :deep(ol) {
  padding-left: 1.5em;
  margin: 1em 0;
}
.md-content :deep(li) {
  margin: 0.3em 0;
}
.md-content :deep(blockquote) {
  margin: 1.2em 0;
  padding: 8px 20px;
  border-left: 4px solid var(--md-primary);
  background: var(--md-surface-container);
  border-radius: 0 var(--md-shape-md) var(--md-shape-md) 0;
  color: var(--md-on-surface-variant);
}
.md-content :deep(code) {
  font-family: var(--md-font-mono);
  font-size: 0.88em;
  background: var(--md-surface-container-high);
  padding: 2px 6px;
  border-radius: var(--md-shape-xs);
}
.md-content :deep(pre) {
  background: var(--md-surface-container-highest);
  padding: 18px;
  border-radius: var(--md-shape-lg);
  overflow-x: auto;
  margin: 1.2em 0;
}
.md-content :deep(pre code) {
  background: none;
  padding: 0;
}
.md-content :deep(img) {
  border-radius: var(--md-shape-lg);
  margin: 1.4em 0;
}
.md-content :deep(.md-figure) {
  margin: 1.6em 0;
}
.md-content :deep(.md-figure figcaption) {
  text-align: center;
  font-size: 0.82rem;
  color: var(--md-on-surface-variant);
  margin-top: 8px;
}
.md-content :deep(hr) {
  border: none;
  height: 1px;
  background: var(--md-outline-variant);
  margin: 2em 0;
}
.md-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1.2em 0;
}
.md-content :deep(th),
.md-content :deep(td) {
  border: 1px solid var(--md-outline-variant);
  padding: 8px 12px;
  text-align: left;
}
.post-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 40px;
}
.post-end {
  margin-top: 32px;
  padding-top: 32px;
  border-top: 1px solid var(--md-outline-variant);
}
</style>
