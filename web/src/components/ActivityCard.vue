<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import NintendoPanel from './NintendoPanel.vue'
import { api } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { auth } from '@/stores/auth'
import type { ActivityResponse, Card } from '@/lib/types'

const props = defineProps<{ card?: Card; username?: string }>()

const providers = computed<string[]>(() => {
  const cfg = props.card?.config?.providers
  return Array.isArray(cfg) && cfg.length ? cfg : ['github', 'steam', 'nintendo']
})

const active = ref<string>(providers.value[0] || 'github')
const loading = ref(false)
const data = ref<ActivityResponse['activity']>({})

const PROVIDER_META: Record<string, { icon: string; label: string }> = {
  github: { icon: 'github', label: 'GitHub' },
  steam: { icon: 'steam', label: 'Steam' },
  nintendo: { icon: 'nintendo', label: 'Nintendo' },
}

async function load() {
  loading.value = true
  try {
    const q = new URLSearchParams({ providers: providers.value.join(',') })
    if (props.username) q.set('username', props.username)
    const res = await api<ActivityResponse>(`/activity?${q.toString()}`, { auth: false })
    data.value = res.activity
  } catch {
    data.value = {}
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(providers, (list) => {
  if (!list.includes(active.value)) active.value = list[0] || 'github'
  load()
})

const current = computed(() => data.value[active.value as keyof typeof data.value])
const steamGames = computed(() => (current.value as any)?.games || [])
</script>

<template>
  <div class="activity">
    <div class="activity-top">
      <div class="segmented">
        <button
          v-for="p in providers"
          :key="p"
          :class="{ active: active === p }"
          @click="active = p"
        >
          <AppIcon :name="PROVIDER_META[p]?.icon || 'link'" :size="16" />
          <span>{{ PROVIDER_META[p]?.label || p }}</span>
        </button>
      </div>
      <button class="icon-btn sm" title="刷新" :disabled="loading" @click="load">
        <span v-if="loading" class="spinner" style="width: 16px; height: 16px" />
        <AppIcon v-else name="refresh" :size="18" />
      </button>
    </div>

    <div class="activity-body">
      <template v-if="loading">
        <div class="skeleton" style="height: 64px; margin-bottom: 12px" />
        <div class="skeleton" style="height: 40px; margin-bottom: 8px" />
        <div class="skeleton" style="height: 40px" />
      </template>

      <template v-else-if="!current || !current.configured">
        <div class="empty-mini">
          <AppIcon name="link" :size="26" />
          <p>尚未绑定 {{ PROVIDER_META[active]?.label }} 账户</p>
          <router-link v-if="auth.user" to="/settings" class="btn btn-tonal btn-sm">
            <AppIcon name="settings" :size="16" />前往设置
          </router-link>
        </div>
      </template>

      <template v-else-if="current.ok === false && active !== 'nintendo'">
        <div class="empty-mini error">
          <AppIcon name="history" :size="26" />
          <p>{{ (current as any).error || '获取失败，请检查配置' }}</p>
          <button class="btn btn-tonal btn-sm" @click="load">
            <AppIcon name="refresh" :size="16" />重试
          </button>
        </div>
      </template>

      <!-- GitHub -->
      <template v-else-if="active === 'github'">
        <div class="gh-head">
          <img v-if="(current as any).avatar" class="avatar" :src="(current as any).avatar" alt="" />
          <div>
            <strong>{{ (current as any).name || (current as any).username }}</strong>
            <span class="md-muted">@{{ (current as any).username }}</span>
          </div>
        </div>
        <div class="stat-row">
          <div class="stat"><strong>{{ (current as any).repos }}</strong><span>仓库</span></div>
          <div class="stat"><strong>{{ (current as any).followers }}</strong><span>关注者</span></div>
          <div class="stat"><strong>{{ (current as any).following }}</strong><span>正在关注</span></div>
        </div>

        <a
          v-if="(current as any).latestCommit"
          class="commit-card"
          :href="(current as any).latestCommit.url"
          target="_blank"
          rel="noopener"
        >
          <span class="commit-icon"><AppIcon name="code" :size="18" /></span>
          <div class="commit-main">
            <p class="commit-msg">{{ (current as any).latestCommit.message }}</p>
            <span class="md-muted">
              {{ (current as any).latestCommit.repo }}
              · {{ (current as any).latestCommit.count }} 个提交
              · {{ (current as any).latestCommit.sha }}
              · {{ formatRelative((current as any).latestCommit.date) }}
            </span>
          </div>
          <AppIcon class="commit-out" name="open_in_new" :size="16" />
        </a>
        <div v-else class="muted-line">暂无公开提交</div>
      </template>

      <!-- Steam -->
      <template v-else-if="active === 'steam'">
        <div v-if="(current as any).player" class="gh-head">
          <img class="avatar" :src="(current as any).player.avatar" alt="" />
          <div>
            <strong>{{ (current as any).player.name }}</strong>
            <span class="md-muted">最近在玩</span>
          </div>
        </div>
        <ul class="game-list">
          <li v-for="g in steamGames" :key="g.appid">
            <img :src="g.icon" alt="" />
            <div class="game-info">
              <p>{{ g.name }}</p>
              <span class="md-muted">近两周 {{ g.playtime }}h · 总计 {{ g.total }}h</span>
            </div>
          </li>
          <li v-if="!steamGames.length" class="muted-line">最近两周没有游戏记录</li>
        </ul>
      </template>

      <!-- Nintendo -->
      <template v-else-if="active === 'nintendo'">
        <NintendoPanel :data="(current as any)" @retry="load" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.activity-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.activity-top .segmented {
  flex-wrap: wrap;
}
.activity-top .segmented button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 34px;
  font-size: 0.84rem;
}
.activity-body {
  min-height: 120px;
}
.empty-mini {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 12px;
  text-align: center;
  color: var(--md-on-surface-variant);
  border: 1px dashed var(--md-outline-variant);
  border-radius: var(--md-shape-lg);
}
.empty-mini.error {
  color: var(--md-error);
  border-color: color-mix(in srgb, var(--md-error) 40%, transparent);
}
.gh-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}
.gh-head div {
  display: flex;
  flex-direction: column;
}
.gh-head strong {
  font-size: 1.1rem;
}
.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  border-radius: var(--md-shape-lg);
  background: var(--md-surface-container-high);
}
.stat strong {
  font-size: 1.25rem;
  color: var(--md-primary);
}
.stat span {
  font-size: 0.76rem;
  color: var(--md-on-surface-variant);
}
.commit-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--md-shape-lg);
  background: var(--md-surface-container-high);
  color: var(--md-on-surface);
  text-decoration: none;
  transition: transform var(--md-dur-short) var(--md-ease-expressive),
    background-color var(--md-dur-short) var(--md-ease-standard);
}
.commit-card:hover {
  text-decoration: none;
  transform: translateX(4px);
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}
.commit-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--md-shape-sm);
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
  flex: none;
}
.commit-main {
  flex: 1;
  min-width: 0;
}
.commit-msg {
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.commit-main .md-muted {
  font-size: 0.74rem;
}
.commit-out {
  flex: none;
  opacity: 0.5;
}
.event-list,
.game-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 260px;
  overflow: auto;
}
.event-list li {
  display: flex;
  gap: 12px;
  padding: 8px 4px;
  align-items: flex-start;
}
.event-list .dot {
  width: 8px;
  height: 8px;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--md-primary);
  flex: none;
}
.event-list p {
  font-size: 0.88rem;
  line-height: 1.4;
}
.event-list time {
  font-size: 0.74rem;
}
.game-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px;
}
.game-list img,
.game-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--md-shape-sm);
  object-fit: cover;
  display: grid;
  place-items: center;
  background: var(--md-surface-container-high);
  color: var(--md-primary);
  flex: none;
}
.game-info {
  min-width: 0;
}
.game-info p {
  font-size: 0.9rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.game-info span {
  font-size: 0.76rem;
}
.nintendo-code {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-radius: var(--md-shape-lg);
  background: var(--md-tertiary-container);
  color: var(--md-on-tertiary-container);
  margin-bottom: 14px;
}
.nintendo-code div {
  display: flex;
  flex-direction: column;
}
.nintendo-code .md-muted {
  color: inherit;
  opacity: 0.75;
  font-size: 0.76rem;
}
.muted-line {
  color: var(--md-on-surface-variant);
  font-size: 0.85rem;
  padding: 12px 4px;
}
</style>
