<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { excerpt } from '@/lib/markdown'
import { formatDate, readingTime } from '@/lib/format'
import type { Post } from '@/lib/types'

const props = defineProps<{ posts: Post[]; limit?: number }>()
const items = computed(() => props.posts.slice(0, props.limit || 3))
</script>

<template>
  <div class="posts">
    <ul v-if="items.length" class="post-list">
      <li v-for="post in items" :key="post.id">
        <router-link :to="`/blog/${post.slug}`" class="post-row">
          <div class="post-thumb" :style="post.cover ? { backgroundImage: `url(${post.cover})` } : {}">
            <AppIcon v-if="!post.cover" name="article" :size="22" />
          </div>
          <div class="post-main">
            <div class="post-meta">
              <time>{{ formatDate(post.created_at) }}</time>
              <span v-if="post.status !== 'published'" class="badge hidden-badge">{{ post.status === 'draft' ? '草稿' : '已隐藏' }}</span>
              <span class="md-muted">· {{ readingTime(post.content) }} 分钟阅读</span>
            </div>
            <h4 class="post-title">{{ post.title }}</h4>
            <p class="post-excerpt">{{ post.summary || excerpt(post.content) }}</p>
            <div v-if="post.tags.length" class="post-tags">
              <span v-for="tag in post.tags" :key="tag" class="tag">#{{ tag }}</span>
            </div>
          </div>
          <AppIcon class="post-arrow" name="chevron_right" :size="22" />
        </router-link>
      </li>
    </ul>

    <div v-else class="empty-state">
      <AppIcon name="article" :size="32" />
      <p>还没有发布任何帖子</p>
      <router-link to="/write" class="btn btn-tonal btn-sm" v-if="$route.name !== 'setup'">
        <AppIcon name="edit" :size="16" />写第一篇
      </router-link>
    </div>

    <router-link v-if="items.length" to="/blog" class="view-all">
      查看全部帖子 <AppIcon name="chevron_right" :size="18" />
    </router-link>
  </div>
</template>

<style scoped>
.post-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.post-list li + li {
  border-top: 1px solid color-mix(in srgb, var(--md-outline-variant) 50%, transparent);
}
.post-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 8px;
  border-radius: var(--md-shape-lg);
  color: var(--md-on-surface);
  text-decoration: none;
  transition: background-color var(--md-dur-short) var(--md-ease-standard),
    transform var(--md-dur-short) var(--md-ease-expressive);
}
.post-row:hover {
  background: color-mix(in srgb, var(--md-on-surface) 5%, transparent);
  text-decoration: none;
}
.post-row:hover .post-arrow {
  transform: translateX(4px);
  color: var(--md-primary);
}
.post-thumb {
  width: 64px;
  height: 64px;
  border-radius: var(--md-shape-md);
  background: var(--md-surface-container-high) center/cover no-repeat;
  display: grid;
  place-items: center;
  color: var(--md-primary);
  flex: none;
}
.post-main {
  min-width: 0;
  flex: 1;
}
.post-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.76rem;
  color: var(--md-on-surface-variant);
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.post-title {
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  margin-bottom: 4px;
}
.post-excerpt {
  font-size: 0.86rem;
  color: var(--md-on-surface-variant);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.post-tags {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.tag {
  font-size: 0.74rem;
  color: var(--md-primary);
  font-weight: 600;
}
.post-arrow {
  color: var(--md-on-surface-variant);
  transition: transform var(--md-dur-short) var(--md-ease-expressive),
    color var(--md-dur-short) var(--md-ease-standard);
}
.view-all {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 14px;
  font-weight: 600;
  font-size: 0.88rem;
}
.empty-state .btn {
  margin-top: 12px;
}
</style>
