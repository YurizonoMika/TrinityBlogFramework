<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { login } from '@/stores/auth'
import { site, toggleTheme } from '@/stores/site'
import { notify } from '@/stores/toast'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const form = reactive({ username: '', password: '' })

async function submit() {
  if (!form.username || !form.password) return notify('请输入用户名和密码', 'error')
  loading.value = true
  try {
    await login(form.username, form.password)
    notify('登录成功', 'success')
    const redirect = (route.query.redirect as string) || '/'
    router.push(redirect)
  } catch (e: any) {
    notify(e.message || '登录失败', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-view">
    <button class="icon-btn theme-toggle" @click="toggleTheme">
      <AppIcon :name="site.theme === 'dark' ? 'light_mode' : 'dark_mode'" :size="20" />
    </button>

    <div class="login-card">
      <router-link to="/" class="back">
        <AppIcon name="arrow_back" :size="18" />返回首页
      </router-link>
      <div class="login-mark">{{ (site.site.title || '我').charAt(0) }}</div>
      <h1 class="md-headline">{{ site.site.title || '我的主页' }}</h1>
      <p class="md-muted">登录以管理你的内容</p>

      <form @submit.prevent="submit">
        <label class="field">
          <input v-model="form.username" class="field-input" placeholder=" " autocomplete="username" />
          <span class="field-label">用户名</span>
        </label>
        <label class="field">
          <input v-model="form.password" type="password" class="field-input" placeholder=" " autocomplete="current-password" />
          <span class="field-label">密码</span>
        </label>
        <button class="btn btn-filled btn-block" type="submit" :disabled="loading">
          <span v-if="loading" class="spinner" />
          <AppIcon v-else name="lock" :size="18" />
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-view {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(60vw 60vw at 15% 10%, var(--md-primary-container), transparent 60%),
    radial-gradient(50vw 50vw at 90% 90%, var(--md-tertiary-container), transparent 60%),
    var(--md-surface);
}
.theme-toggle {
  position: absolute;
  top: 20px;
  right: 20px;
}
.login-card {
  width: min(420px, 100%);
  padding: 36px 32px;
  border-radius: var(--md-shape-2xl);
  background: color-mix(in srgb, var(--md-surface-container-low) 88%, transparent);
  backdrop-filter: blur(18px);
  box-shadow: var(--md-elev-2);
  animation: pop-in var(--md-dur-long) var(--md-ease-expressive);
}
.login-mark {
  width: 60px;
  height: 60px;
  border-radius: var(--md-shape-lg);
  background: var(--md-primary);
  color: var(--md-on-primary);
  display: grid;
  place-items: center;
  font-size: 1.7rem;
  font-weight: 800;
  margin-bottom: 18px;
}
.login-card h1 {
  margin-bottom: 4px;
}
.login-card form {
  margin-top: 24px;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--md-on-surface-variant);
  margin-bottom: 20px;
}
.back:hover {
  text-decoration: none;
  color: var(--md-primary);
}
</style>
