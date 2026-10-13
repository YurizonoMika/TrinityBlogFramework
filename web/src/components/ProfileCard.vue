<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { site } from '@/stores/site'

const profile = computed(() => site.profile)
const initial = computed(() => (profile.value?.display_name || 'A').trim().charAt(0).toUpperCase())
const links = computed(() => profile.value?.links || [])
</script>

<template>
  <div class="profile">
    <div class="profile-head">
      <img v-if="profile?.avatar" class="avatar lg" :src="profile.avatar" :alt="profile.display_name" />
      <span v-else class="avatar lg">{{ initial }}</span>
      <div class="profile-id">
        <h4 class="profile-name">{{ profile?.display_name || '未设置昵称' }}</h4>
        <span class="md-muted">@{{ profile?.username || 'user' }}</span>
      </div>
    </div>

    <p class="profile-bio">
      {{ profile?.bio || '还没有填写个人简介，去「用户设置」里添加一段介绍吧。' }}
    </p>

    <div v-if="links.length" class="profile-links">
      <a
        v-for="link in links"
        :key="link.url"
        class="chip static"
        :href="link.url"
        target="_blank"
        rel="noopener"
      >
        <AppIcon :name="link.icon || 'link'" :size="15" />
        {{ link.label }}
      </a>
    </div>

    <div class="profile-foot">
      <a v-if="profile?.email" class="btn btn-tonal btn-sm" :href="`mailto:${profile.email}`">
        <AppIcon name="chat" :size="16" />联系我
      </a>
      <router-link to="/blog" class="btn btn-outlined btn-sm">
        <AppIcon name="article" :size="16" />看看博客
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.profile-head {
  display: flex;
  align-items: center;
  gap: 16px;
}
.profile-name {
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.profile-bio {
  margin: 18px 0;
  color: var(--md-on-surface-variant);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.profile-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.profile-links .chip:hover {
  color: var(--md-primary);
  border-color: var(--md-primary);
  text-decoration: none;
}
.profile-foot {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  flex-wrap: wrap;
}
</style>
