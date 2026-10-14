// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { createRouter, createWebHistory } from 'vue-router'
import { auth, bootstrap } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    return { top: 0 }
  },
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/user/:username', name: 'user-home', component: () => import('@/views/HomeView.vue') },
    { path: '/blog', name: 'blog', component: () => import('@/views/BlogView.vue') },
    { path: '/blog/:slug', name: 'post', component: () => import('@/views/PostView.vue') },
    { path: '/moments', name: 'moments', component: () => import('@/views/MomentsView.vue') },
    {
      path: '/p/:plugin/:page',
      name: 'plugin-page',
      component: () => import('@/views/PluginPageView.vue'),
    },
    {
      path: '/write',
      name: 'write',
      component: () => import('@/views/EditorView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/write/:id',
      name: 'edit',
      component: () => import('@/views/EditorView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { requiresAuth: true },
    },
    { path: '/teaparty', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/setup', name: 'setup', component: () => import('@/views/SetupView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  await bootstrap()
  if (!auth.setupComplete && to.name !== 'setup') {
    return { name: 'setup' }
  }
  if (auth.setupComplete && to.name === 'setup') {
    return { name: 'home' }
  }
  if (to.meta.requiresAuth && !auth.user) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
})

export default router
