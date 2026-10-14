<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import BaseDialog from '@/components/BaseDialog.vue'
import { api } from '@/lib/api'
import { excerpt } from '@/lib/markdown'
import { formatDate, readingTime } from '@/lib/format'
import { auth, can } from '@/stores/auth'
import { site } from '@/stores/site'
import { notify } from '@/stores/toast'
import type { Post } from '@/lib/types'

const route = useRoute()
const routeUsername = computed(() => (route.query.username as string) || '')
const posts = ref<Post[]>([])
const loading = ref(true)
const search = ref('')
const activeCategory = ref<string>('')
const confirmPost = ref<Post | null>(null)

function canManage(post: Post) {
  return Boolean(auth.user && (auth.user.role === 'admin' || post.author_id === auth.user.id))
}

const categories = computed(() => site.categories)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return posts.value.filter((p) => {
    if (activeCategory.value && p.category !== activeCategory.value) return false
    if (!q) return true
    return (
      p.title.toLowerCase().includes(q) ||
      p.summary.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q))
    )
  })
})

async function load() {
  loading.value = true
  try {
    const all = auth.user ? '&all=1' : ''
    const scope = routeUsername.value ? `&username=${encodeURIComponent(routeUsername.value)}` : ''
    const res = await api<{ posts: Post[] }>(`/posts?limit=200${all}${scope}`, { auth: false })
    posts.value = res.posts
  } catch {
    notify('帖子加载失败', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(routeUsername, load)

async function toggleStatus(post: Post) {
  const next = post.status === 'published' ? 'hidden' : 'published'
  try {
    const res = await api<{ post: Post }>(`/posts/${post.id}/status`, {
      method: 'PATCH',
      body: { status: next },
    })
    const idx = posts.value.findIndex((p) => p.id === post.id)
    if (idx !== -1) posts.value[idx] = res.post
    notify(next === 'published' ? '帖子已公开' : '帖子已隐藏', 'success')
  } catch (e: any) {
    notify(e.message || '操作失败', 'error')
  }
}

async function doDelete() {
  if (!confirmPost.value) return
  try {
    await api(`/posts/${confirmPost.value.id}`, { method: 'DELETE' })
    posts.value = posts.value.filter((p) => p.id !== confirmPost.value!.id)
    notify('帖子已删除', 'success')
  } catch (e: any) {
    notify(e.message || '删除失败', 'error')
  } finally {
    confirmPost.value = null
  }
}

function statusLabel(s: Post['status']) {
  return s === 'published' ? '已公开' : s === 'draft' ? '草稿' : '已隐藏'
}
</script>

<template>
  <div class="blog md-container">
    <header class="blog-head">
      <div>
        <span class="md-label">BLOG</span>
        <h1 class="md-headline">{{ routeUsername ? `@${routeUsername} 的文章` : '博客文章' }}</h1>
        <p class="md-muted">共 {{ posts.length }} 篇文章</p>
      </div>
      <router-link v-if="auth.user && can('post')" to="/write" class="btn btn-filled">
        <AppIcon name="edit" :size="18" />写文章
      </router-link>
    </header>

    <div class="blog-tools">
      <label class="search">
        <AppIcon name="filter" :size="18" />
        <input v-model="search" placeholder="搜索文章…" />
        <button v-if="search" class="icon-btn sm" @click="search = ''">
          <AppIcon name="close" :size="16" />
        </button>
      </label>
      <div v-if="categories.length" class="tag-bar">
        <button class="chip" :class="{ active: !activeCategory }" @click="activeCategory = ''">全部</button>
        <button
          v-for="c in categories"
          :key="c"
          class="chip"
          :class="{ active: activeCategory === c }"
          @click="activeCategory = activeCategory === c ? '' : c"
        >
          {{ c }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="post-grid">
      <div v-for="i in 6" :key="i" class="skeleton" style="height: 240px; border-radius: 24px" />
    </div>

    <div v-else-if="filtered.length" class="post-grid">
      <article v-for="post in filtered" :key="post.id" class="post-card" :class="{ hidden: post.status !== 'published' }">
        <router-link :to="`/blog/${post.slug}`" class="post-cover" :style="post.cover ? { backgroundImage: `url(${post.cover})` } : {}">
          <AppIcon v-if="!post.cover" name="article" :size="30" />
        </router-link>

        <div class="post-content">
          <div class="post-meta">
            <span v-if="post.category" class="category-badge">{{ post.category }}</span>
            <time>{{ formatDate(post.created_at) }}</time>
            <span class="md-muted">· {{ readingTime(post.content) }} 分钟</span>
            <span v-if="post.status !== 'published'" class="badge hidden-badge">{{ statusLabel(post.status) }}</span>
          </div>
          <router-link :to="`/blog/${post.slug}`" class="post-title-link">
            <h3 class="post-title">{{ post.title }}</h3>
          </router-link>
          <p class="post-excerpt">{{ post.summary || excerpt(post.content, 110) }}</p>
          <div class="post-foot">
            <div class="post-tags">
              <span v-for="t in post.tags.slice(0, 3)" :key="t" class="tag">#{{ t }}</span>
            </div>
            <div v-if="canManage(post)" class="post-admin">
              <button class="icon-btn sm" :title="post.status === 'published' ? '隐藏' : '公开'" @click="toggleStatus(post)">
                <AppIcon :name="post.status === 'published' ? 'visibility' : 'visibility_off'" :size="17" />
              </button>
              <router-link :to="`/write/${post.id}`" class="icon-btn sm" title="编辑">
                <AppIcon name="edit" :size="17" />
              </router-link>
              <button class="icon-btn sm danger" title="删除" @click="confirmPost = post">
                <AppIcon name="delete" :size="17" />
              </button>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="empty-state">
      <AppIcon name="article" :size="36" />
      <p>{{ search || activeCategory ? '没有找到匹配的文章' : '还没有发布任何文章' }}</p>
      <router-link v-if="auth.user && !search && !activeCategory" to="/write" class="btn btn-tonal btn-sm">
        <AppIcon name="edit" :size="16" />写第一篇
      </router-link>
    </div>

    <BaseDialog :open="!!confirmPost" title="删除文章" @close="confirmPost = null">
      <p>确定要删除「{{ confirmPost?.title }}」吗？此操作无法撤销。</p>
      <template #actions>
        <button class="btn" @click="confirmPost = null">取消</button>
        <button class="btn btn-danger" @click="doDelete"><AppIcon name="delete" :size="16" />删除</button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.blog {
  padding: var(--section-space, 40px) 0 clamp(48px, 10vw, 96px);
}
.blog-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}
.blog-head h1 {
  margin: 2px 0 4px;
}
.blog-tools {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 28px;
  flex-wrap: wrap;
}
.search {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 16px;
  border-radius: var(--md-shape-full);
  background: var(--md-surface-container-high);
  color: var(--md-on-surface-variant);
  min-width: 240px;
  flex: 1;
  max-width: 360px;
  transition: box-shadow var(--md-dur-short) var(--md-ease-standard);
}
.search:focus-within {
  box-shadow: 0 0 0 2px var(--md-primary);
}
.search input {
  border: none;
  background: transparent;
  outline: none;
  flex: 1;
  color: var(--md-on-surface);
}
.tag-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.post-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: clamp(16px, 2vw, 24px);
}
.post-card {
  display: flex;
  flex-direction: column;
  background: var(--md-surface-container-low);
  border: 1px solid color-mix(in srgb, var(--md-outline-variant) 50%, transparent);
  border-radius: var(--md-shape-2xl);
  overflow: hidden;
  transition: transform var(--md-dur-medium) var(--md-ease-expressive),
    box-shadow var(--md-dur-medium) var(--md-ease-standard);
}
.post-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--md-elev-2);
}
.post-card.hidden {
  opacity: 0.72;
}
.post-cover {
  display: grid;
  place-items: center;
  height: 150px;
  background: linear-gradient(135deg, var(--md-primary-container), var(--md-tertiary-container)) center/cover no-repeat;
  color: var(--md-on-primary-container);
}
.post-cover:hover {
  text-decoration: none;
}
.post-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 18px;
}
.post-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.76rem;
  color: var(--md-on-surface-variant);
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.category-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 9px;
  border-radius: var(--md-shape-full);
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
  font-weight: 700;
  font-size: 0.7rem;
}
.post-title-link {
  color: var(--md-on-surface);
  text-decoration: none;
}
.post-title {
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-bottom: 8px;
}
.post-title-link:hover {
  text-decoration: none;
  color: var(--md-primary);
}
.post-excerpt {
  font-size: 0.88rem;
  color: var(--md-on-surface-variant);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}
.post-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 14px;
}
.post-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.tag {
  font-size: 0.74rem;
  color: var(--md-primary);
  font-weight: 600;
}
.post-admin {
  display: flex;
  gap: 2px;
}
.icon-btn.danger {
  color: var(--md-error);
}
</style>
