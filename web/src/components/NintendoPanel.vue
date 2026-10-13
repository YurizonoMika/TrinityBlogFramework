<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { ActivityNintendo } from '@/lib/types'

defineProps<{ data: ActivityNintendo }>()
const emit = defineEmits<{ (e: 'retry'): void }>()

function formatHours(minutes = 0): string {
  if (!minutes) return '—'
  const hours = minutes / 60
  return hours >= 10 ? `${Math.round(hours)} 小时` : `${Math.round(hours * 10) / 10} 小时`
}

function copyFriendCode(code: string) {
  navigator.clipboard?.writeText(code).catch(() => {})
}
</script>

<template>
  <!-- live NSO data -->
  <template v-if="data.linked && data.ok && data.user">
    <div class="nso-me">
      <div class="me-avatar">
        <img :src="data.user.imageUri" :alt="data.user.name" />
        <span class="status-dot online" />
      </div>
      <div class="me-info">
        <div class="me-name">
          <strong>{{ data.user.name }}</strong>
          <span v-if="data.user.membershipActive" class="badge success">
            <AppIcon name="nintendo" :size="12" />NSO
          </span>
        </div>
        <button
          v-if="data.user.friendCode"
          class="friend-code"
          :title="'好友代码'"
          @click="copyFriendCode(data.user.friendCode)"
        >
          SW-{{ data.user.friendCode }}
          <AppIcon name="code" :size="13" />
        </button>
      </div>
    </div>

    <div class="highlight-grid">
      <div v-if="data.recent" class="hl-card">
        <span class="hl-label"><AppIcon name="history" :size="13" />最近玩过</span>
        <div class="hl-body">
          <img
            v-if="data.recent.imageUri"
            class="hl-cover"
            :src="data.recent.imageUri"
            alt=""
            loading="lazy"
          />
          <span v-else class="hl-cover placeholder"><AppIcon name="nintendo" :size="20" /></span>
          <div class="hl-text">
            <p>{{ data.recent.name }}</p>
            <span class="md-muted">累计 {{ formatHours(data.recent.totalPlayTime) }}</span>
          </div>
        </div>
      </div>

      <div v-if="data.nowPlaying" class="hl-card playing">
        <span class="hl-label">
          <span class="pulse" />
          正在游玩
        </span>
        <div class="hl-body">
          <img
            v-if="data.nowPlaying.game.imageUri"
            class="hl-cover"
            :src="data.nowPlaying.game.imageUri"
            alt=""
            loading="lazy"
          />
          <span v-else class="hl-cover placeholder"><AppIcon name="nintendo" :size="20" /></span>
          <div class="hl-text">
            <p>{{ data.nowPlaying.game.name }}</p>
            <span v-if="data.nowPlaying.game.totalPlayTime" class="md-muted">
              累计 {{ formatHours(data.nowPlaying.game.totalPlayTime) }}
            </span>
          </div>
        </div>
      </div>

      <div v-else class="hl-card muted">
        <span class="hl-label">正在游玩</span>
        <p class="hl-none">你当前未在游玩</p>
      </div>
    </div>
  </template>

  <!-- linked but request failed -->
  <template v-else-if="data.linked && data.ok === false">
    <template v-if="data.degraded && (data.friendCode || (data.games || []).length)">
      <div class="degraded-banner">
        <AppIcon name="history" :size="16" />
        <span>{{ data.note || '实时同步暂不可用，以下为手动记录。' }}</span>
        <button class="retry-link" @click="emit('retry')">
          <AppIcon name="refresh" :size="14" />重试
        </button>
      </div>
      <div v-if="data.friendCode" class="nintendo-code">
        <AppIcon name="nintendo" :size="20" />
        <div>
          <span class="md-muted">好友代码</span>
          <strong>SW-{{ data.friendCode }}</strong>
        </div>
      </div>
      <ul class="game-list">
        <li v-for="(g, i) in (data.games || [])" :key="i">
          <span class="game-icon"><AppIcon name="nintendo" :size="20" /></span>
          <div class="game-info">
            <p>{{ g.name }}</p>
            <span class="md-muted">{{ g.playtime || '—' }}</span>
          </div>
        </li>
      </ul>
    </template>

    <div v-else class="empty-mini error">
      <AppIcon name="history" :size="26" />
      <p>{{ data.error || 'NSO 数据获取失败' }}</p>
      <div class="error-actions">
        <button class="btn btn-tonal btn-sm" @click="emit('retry')">
          <AppIcon name="refresh" :size="15" />重试
        </button>
        <router-link
          v-if="data.errorCode === 'reauth'"
          to="/settings?tab=activity"
          class="btn btn-outlined btn-sm"
        >
          <AppIcon name="nintendo" :size="15" />重新绑定
        </router-link>
      </div>
    </div>
  </template>

  <!-- manual fallback -->
  <template v-else>
    <div v-if="data.friendCode" class="nintendo-code">
      <AppIcon name="nintendo" :size="20" />
      <div>
        <span class="md-muted">好友代码</span>
        <strong>SW-{{ data.friendCode }}</strong>
      </div>
    </div>
    <ul class="game-list">
      <li v-for="(g, i) in (data.games || [])" :key="i">
        <span class="game-icon"><AppIcon name="nintendo" :size="20" /></span>
        <div class="game-info">
          <p>{{ g.name }}</p>
          <span class="md-muted">{{ g.playtime || '—' }}</span>
        </div>
      </li>
      <li v-if="!(data.games || []).length" class="muted-line">
        {{ data.note || '暂无游戏记录' }}
      </li>
    </ul>
  </template>
</template>

<style scoped>
.nso-me {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}
.me-avatar {
  position: relative;
  flex: none;
}
.me-avatar img {
  width: 56px;
  height: 56px;
  border-radius: var(--md-shape-full);
  object-fit: cover;
  background: var(--md-surface-container-high);
}
.me-name {
  display: flex;
  align-items: center;
  gap: 8px;
}
.me-name strong {
  font-size: 1.1rem;
}
.friend-code {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  border: none;
  background: none;
  color: var(--md-on-surface-variant);
  font-family: var(--md-font-mono);
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0;
}
.friend-code:hover {
  color: var(--md-primary);
}
.status-dot {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2.5px solid var(--md-surface-container-low);
  background: var(--md-outline);
}
.status-dot.playing { background: #1fa463; }
.status-dot.online { background: #2f74d0; }
.status-dot.idle { background: #e0a100; }
.status-dot.offline { background: var(--md-outline); }
.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 18px;
}
.highlight-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}
.hl-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: var(--md-shape-lg);
  background: var(--md-surface-container-high);
  min-width: 0;
}
.hl-card.playing {
  background: color-mix(in srgb, #1fa463 16%, var(--md-surface-container-high));
}
.hl-card.muted {
  opacity: 0.85;
}
.hl-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--md-on-surface-variant);
}
.hl-card.playing .hl-label {
  color: #1fa463;
}
.hl-body {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.hl-cover {
  width: 44px;
  height: 44px;
  border-radius: var(--md-shape-sm);
  object-fit: cover;
  flex: none;
  background: var(--md-surface-container-highest);
}
.hl-cover.placeholder {
  display: grid;
  place-items: center;
  color: var(--md-primary);
}
.hl-text {
  min-width: 0;
}
.hl-text p {
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hl-text span {
  font-size: 0.72rem;
}
.hl-none {
  font-size: 0.84rem;
  color: var(--md-on-surface-variant);
  margin-top: 2px;
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
  font-size: 0.74rem;
  color: var(--md-on-surface-variant);
}
.friend-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.live-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.74rem;
  font-weight: 600;
  color: #1fa463;
}
.pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #1fa463;
  animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.75); }
}
.nso-friends {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow: auto;
}
.nso-friend {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 6px;
  border-radius: var(--md-shape-lg);
  transition: background-color var(--md-dur-short) var(--md-ease-standard);
}
.nso-friend:hover {
  background: color-mix(in srgb, var(--md-on-surface) 5%, transparent);
}
.friend-avatar {
  position: relative;
  flex: none;
}
.friend-avatar img {
  width: 42px;
  height: 42px;
  border-radius: var(--md-shape-full);
  object-fit: cover;
  background: var(--md-surface-container-high);
}
.friend-info {
  min-width: 0;
  flex: 1;
}
.friend-name {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fav {
  color: var(--md-primary);
  display: inline-flex;
}
.friend-state {
  font-size: 0.74rem;
  color: var(--md-on-surface-variant);
}
.friend-state.playing { color: #1fa463; font-weight: 600; }
.friend-state.online { color: #2f74d0; font-weight: 600; }
.friend-game {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 46%;
  flex: none;
}
.game-cover {
  width: 38px;
  height: 38px;
  border-radius: var(--md-shape-sm);
  object-fit: cover;
  flex: none;
  background: var(--md-surface-container-high);
}
.game-text {
  min-width: 0;
}
.game-text p {
  font-size: 0.8rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.game-text span {
  font-size: 0.7rem;
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
.game-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.game-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px;
}
.game-icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--md-shape-sm);
  background: var(--md-surface-container-high);
  color: var(--md-primary);
  flex: none;
}
.game-info p {
  font-size: 0.9rem;
  font-weight: 500;
}
.game-info span {
  font-size: 0.76rem;
}
.muted-line {
  color: var(--md-on-surface-variant);
  font-size: 0.85rem;
  padding: 12px 4px;
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
.error-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.degraded-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  border-radius: var(--md-shape-md);
  background: var(--md-surface-container-high);
  color: var(--md-on-surface-variant);
  font-size: 0.8rem;
}
.degraded-banner span {
  flex: 1;
}
.retry-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: none;
  color: var(--md-primary);
  font-weight: 600;
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0;
}
@media (max-width: 560px) {
  .friend-game {
    max-width: 40%;
  }
}
</style>
