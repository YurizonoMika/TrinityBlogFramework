<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { site } from '@/stores/site'
import { auth } from '@/stores/auth'
import { useParallax } from '@/lib/useParallax'
import type { HomepageSettings, PublicProfile } from '@/lib/types'

const props = defineProps<{
  profile?: PublicProfile | null
  homepage?: HomepageSettings | null
  username?: string
}>()

const blogTo = computed(() =>
  props.username ? { path: '/blog', query: { username: props.username } } : '/blog'
)
const momentsTo = computed(() =>
  props.username ? { path: '/moments', query: { username: props.username } } : '/moments'
)

const profile = computed(() => props.profile || site.profile)
const initial = computed(() => (profile.value?.display_name || 'A').trim().charAt(0).toUpperCase())
const tags = computed(() => profile.value?.tags || [])
const banner = computed(() => props.homepage?.banner || site.site.banner || '')
const subtitle = computed(
  () => props.homepage?.subtitle || site.site.subtitle || '欢迎来到我的小站'
)
const description = computed(
  () =>
    props.homepage?.description ||
    site.site.description ||
    profile.value?.bio ||
    '这里记录我的开发与生活。'
)

const bgRef = ref<HTMLElement | null>(null)
useParallax(bgRef, 0.3, 140)
</script>

<template>
  <section class="banner" :class="{ 'has-image': !!banner }">
    <div
      v-if="banner"
      ref="bgRef"
      class="banner-bg"
      :style="{ backgroundImage: `url('${banner}')` }"
    />
    <div v-if="banner" class="banner-scrim" />
    <template v-else>
      <div class="banner-blob b1" />
      <div class="banner-blob b2" />
    </template>
    <div class="md-container banner-inner">
      <div class="banner-copy">
        <span class="banner-eyebrow">
          <AppIcon name="star" :size="15" /> {{ subtitle }}
        </span>
        <h1 class="md-display">
          你好，我是<br />
          <span class="accent-text">{{ profile?.display_name || site.site.title || '站长' }}</span>
        </h1>
        <p class="banner-desc">{{ description }}</p>
        <div class="banner-actions">
          <router-link :to="blogTo" class="btn btn-glass">
            <AppIcon name="article" :size="18" />阅读博客
          </router-link>
          <router-link :to="momentsTo" class="btn btn-glass">
            <AppIcon name="chat" :size="18" />动态
          </router-link>
          <router-link v-if="auth.user" to="/write" class="btn btn-glass">
            <AppIcon name="edit" :size="18" />写新文章
          </router-link>
        </div>
      </div>

      <div class="banner-portrait">
        <div class="portrait-ring">
          <img v-if="profile?.avatar" :src="profile.avatar" :alt="profile.display_name" />
          <span v-else class="portrait-initial">{{ initial }}</span>
        </div>
        <div v-if="tags.length" class="portrait-tags">
          <span v-for="(tag, i) in tags" :key="i" class="portrait-chip">
            <AppIcon :name="tag.icon || 'star'" :size="15" />{{ tag.label }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.banner {
  position: relative;
  overflow: hidden;
  padding: clamp(48px, 8vw, 96px) 0 clamp(64px, 8vw, 104px);
  background: linear-gradient(135deg, var(--md-primary-container) 0%, var(--md-tertiary-container) 55%, var(--md-secondary-container) 100%);
  color: var(--md-on-primary-container);
}
.banner-bg {
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
.banner-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, rgb(0 0 0 / 0.38), rgb(0 0 0 / 0.6));
}
.banner.has-image {
  color: #fff;
}
.banner.has-image .banner-eyebrow {
  background: rgb(255 255 255 / 0.18);
  color: #fff;
  backdrop-filter: blur(6px);
}
.banner.has-image .accent-text {
  color: #fff;
}
.banner-blob {
  position: absolute;
  border-radius: 46% 54% 62% 38% / 47% 42% 58% 53%;
  filter: blur(18px);
  opacity: 0.42;
  z-index: 0;
}
.b1 {
  width: 460px; height: 460px;
  background: var(--md-primary);
  top: -160px; right: -80px;
  animation: drift 20s ease-in-out infinite;
}
.b2 {
  width: 300px; height: 300px;
  background: var(--md-tertiary);
  bottom: -140px; left: -60px;
  animation: drift 26s ease-in-out infinite reverse;
}
@keyframes drift {
  0%, 100% { transform: translate(0, 0) rotate(0); }
  50% { transform: translate(24px, -30px) rotate(20deg); }
}
.banner-inner {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 40px;
}
.banner-copy {
  max-width: 620px;
}
.banner-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: var(--md-shape-full);
  background: color-mix(in srgb, var(--md-surface) 55%, transparent);
  font-weight: 600;
  font-size: 0.84rem;
}
.banner-copy h1 {
  margin: 20px 0 18px;
}
.accent-text {
  color: var(--md-primary);
}
.banner-desc {
  font-size: 1.08rem;
  line-height: 1.7;
  opacity: 0.9;
  max-width: 52ch;
  white-space: pre-wrap;
  word-break: break-word;
}
.banner-actions {
  display: flex;
  gap: 12px;
  margin-top: 28px;
  flex-wrap: wrap;
}
.banner-actions .btn-glass {
  background: color-mix(in srgb, var(--md-surface) 42%, transparent);
  color: var(--md-on-surface);
  border: none;
  backdrop-filter: blur(16px) saturate(1.7);
  -webkit-backdrop-filter: blur(16px) saturate(1.7);
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.1);
}
.banner-actions .btn-glass:hover {
  background: color-mix(in srgb, var(--md-surface) 62%, transparent);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.14);
}
.banner-portrait {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 24px;
}
.portrait-ring {
  width: clamp(180px, 22vw, 260px);
  aspect-ratio: 1;
  border-radius: 42% 58% 55% 45% / 45% 42% 58% 55%;
  overflow: hidden;
  background: var(--md-surface);
  display: grid;
  place-items: center;
  box-shadow: var(--md-elev-3);
  animation: morph 12s ease-in-out infinite;
  border: 6px solid color-mix(in srgb, var(--md-surface) 70%, transparent);
}
@keyframes morph {
  0%, 100% { border-radius: 42% 58% 55% 45% / 45% 42% 58% 55%; }
  50% { border-radius: 56% 44% 42% 58% / 54% 58% 42% 46%; }
}
.portrait-ring img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.portrait-initial {
  font-size: clamp(4rem, 9vw, 6.5rem);
  font-weight: 800;
  color: var(--md-primary);
}
.portrait-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  max-width: 320px;
}
.portrait-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--md-shape-full);
  background: color-mix(in srgb, var(--md-surface) 92%, transparent);
  color: var(--md-on-surface);
  font-weight: 600;
  font-size: 0.82rem;
  box-shadow: var(--md-elev-1);
  backdrop-filter: blur(6px);
  transition: transform var(--md-dur-short) var(--md-ease-expressive);
}
.portrait-chip:hover {
  transform: translateY(-2px);
}
@media (max-width: 860px) {
  .banner-inner {
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
  }
  .banner-portrait {
    align-self: center;
    order: -1;
    padding: 8px;
  }
  .banner-copy h1 {
    font-size: clamp(2.2rem, 11vw, 3.2rem);
  }
}
</style>
