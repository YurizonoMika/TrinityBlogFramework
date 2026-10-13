<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { createSetupAccount } from '@/stores/auth'
import { notify } from '@/stores/toast'

const router = useRouter()
const loading = ref(false)
const form = reactive({ username: '', displayName: '', password: '', confirm: '' })

async function submit() {
  if (!form.username.trim()) return notify('请输入用户名', 'error')
  if (form.password.length < 6) return notify('密码至少需要 6 位', 'error')
  if (form.password !== form.confirm) return notify('两次输入的密码不一致', 'error')
  loading.value = true
  try {
    await createSetupAccount({
      username: form.username.trim(),
      password: form.password,
      displayName: form.displayName.trim(),
    })
    notify('管理员账户创建成功，欢迎！', 'success')
    router.push('/')
  } catch (e: any) {
    notify(e.message || '创建失败', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="setup-view">
    <div class="setup-hero">
      <div class="blob blob-a" />
      <div class="blob blob-b" />
      <div class="blob blob-c" />
      <div class="hero-content">
        <span class="hero-badge"><AppIcon name="settings" :size="16" /> 首次启动</span>
        <h1 class="md-display">欢迎使用<br />你的个人主页</h1>
        <p class="hero-sub">
          在开始之前，请创建一个管理员账户。它将用于管理帖子、首页卡片与个人资料。
        </p>
        <ul class="hero-list">
          <li><AppIcon name="check" :size="18" /> 使用 Markdown 自由写作</li>
          <li><AppIcon name="check" :size="18" /> 拖拽编辑首页卡片</li>
          <li><AppIcon name="check" :size="18" /> 绑定 GitHub 与游戏平台</li>
        </ul>
      </div>
    </div>

    <div class="setup-form-wrap">
      <form class="setup-card" @submit.prevent="submit">
        <h2 class="md-headline">创建管理员账户</h2>
        <p class="md-muted">这些信息之后可以在「用户设置」中修改。</p>

        <div class="fields">
          <label class="field">
            <input v-model="form.username" class="field-input" placeholder=" " autocomplete="username" />
            <span class="field-label">用户名 *</span>
          </label>
          <label class="field">
            <input v-model="form.displayName" class="field-input" placeholder=" " />
            <span class="field-label">显示名称</span>
          </label>
          <label class="field">
            <input v-model="form.password" type="password" class="field-input" placeholder=" " autocomplete="new-password" />
            <span class="field-label">密码 *</span>
          </label>
          <label class="field">
            <input v-model="form.confirm" type="password" class="field-input" placeholder=" " autocomplete="new-password" />
            <span class="field-label">确认密码 *</span>
          </label>
        </div>

        <button class="btn btn-filled btn-block" type="submit" :disabled="loading">
          <span v-if="loading" class="spinner" />
          <AppIcon v-else name="person_add" :size="18" />
          {{ loading ? '创建中…' : '创建账户并进入' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.setup-view {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  min-height: 100vh;
}
.setup-hero {
  position: relative;
  display: flex;
  align-items: center;
  padding: 48px clamp(24px, 6vw, 80px);
  overflow: hidden;
  background: linear-gradient(150deg, var(--md-primary-container), var(--md-tertiary-container));
  color: var(--md-on-primary-container);
}
.blob {
  position: absolute;
  border-radius: 46% 54% 62% 38% / 47% 42% 58% 53%;
  opacity: 0.5;
  filter: blur(6px);
}
.blob-a {
  width: 320px; height: 320px;
  background: var(--md-primary);
  top: -80px; right: -60px;
  animation: float 14s ease-in-out infinite;
}
.blob-b {
  width: 220px; height: 220px;
  background: var(--md-tertiary);
  bottom: 8%; left: -40px;
  animation: float 18s ease-in-out infinite reverse;
}
.blob-c {
  width: 140px; height: 140px;
  background: var(--md-secondary);
  bottom: 30%; right: 18%;
  animation: float 11s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  50% { transform: translate(18px, -24px) rotate(24deg); }
}
.hero-content {
  position: relative;
  z-index: 1;
  max-width: 520px;
}
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: var(--md-shape-full);
  background: color-mix(in srgb, var(--md-surface) 55%, transparent);
  font-weight: 600;
  font-size: 0.82rem;
}
.hero-content h1 {
  margin: 20px 0 16px;
}
.hero-sub {
  font-size: 1.02rem;
  opacity: 0.85;
  max-width: 42ch;
}
.hero-list {
  list-style: none;
  padding: 0;
  margin: 28px 0 0;
  display: grid;
  gap: 12px;
}
.hero-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
}
.setup-form-wrap {
  display: grid;
  place-items: center;
  padding: 40px 24px;
  background: var(--md-surface);
}
.setup-card {
  width: min(420px, 100%);
}
.setup-card h2 {
  margin-bottom: 6px;
}
.fields {
  margin: 28px 0 8px;
}
@media (max-width: 860px) {
  .setup-view {
    grid-template-columns: 1fr;
  }
  .setup-hero {
    padding: 48px 24px 64px;
    min-height: auto;
  }
  .hero-content h1 {
    font-size: clamp(2rem, 9vw, 3rem);
  }
  .setup-form-wrap {
    padding: 32px 24px 56px;
  }
}
</style>
