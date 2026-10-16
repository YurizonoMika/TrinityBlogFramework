<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import BaseDialog from '@/components/BaseDialog.vue'
import ImageLightbox from '@/components/ImageLightbox.vue'
import { api, uploadFile } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { auth, can } from '@/stores/auth'
import { site } from '@/stores/site'
import { notify } from '@/stores/toast'
import type { Moment } from '@/lib/types'

const MAX_LEN = 200
const MAX_IMAGES = 4

const route = useRoute()
const routeUsername = computed(() => (route.query.username as string) || '')
const moments = ref<Moment[]>([])
const loading = ref(true)
// the page's owner (site owner when unscoped) — only they (or an admin) may post here
const ownerUsername = computed(() => routeUsername.value || site.profile?.username || '')
const canCompose = computed(() => can('moment') && auth.user?.username === ownerUsername.value)

const composer = reactive({
  open: false,
  id: 0,
  content: '',
  images: [] as string[],
  uploading: false,
})

const confirmMoment = ref<Moment | null>(null)

const lightbox = reactive({ open: false, images: [] as string[], index: 0 })

const remaining = computed(() => MAX_LEN - composer.content.length)

async function load() {
  loading.value = true
  try {
    const scope = routeUsername.value ? `&username=${encodeURIComponent(routeUsername.value)}` : ''
    const res = await api<{ moments: Moment[] }>(`/moments?limit=200${scope}`, { auth: false })
    moments.value = res.moments
  } catch {
    notify('动态加载失败', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await load()
  await nextTick()
  flashFromQuery()
})

watch(routeUsername, load)

watch(
  () => route.query.m,
  () => {
    if (route.name === 'moments') flashFromQuery()
  }
)

function flashFromQuery() {
  const id = Number(route.query.m)
  if (!id) return
  const el = document.getElementById(`moment-${id}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  window.setTimeout(() => {
    el.classList.remove('flash')
    // force reflow so the animation can replay
    void el.offsetWidth
    el.classList.add('flash')
    el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true })
  }, 320)
}

function openComposer(moment?: Moment) {
  composer.id = moment?.id || 0
  composer.content = moment?.content || ''
  composer.images = moment ? [...moment.images] : []
  composer.open = true
}

async function onPickImages(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return
  composer.uploading = true
  try {
    for (const file of files) {
      if (composer.images.length >= MAX_IMAGES) break
      const res = await uploadFile(file)
      composer.images.push(res.url)
    }
  } catch (err: any) {
    notify(err.message || '图片上传失败', 'error')
  } finally {
    composer.uploading = false
  }
}

function removeImage(i: number) {
  composer.images.splice(i, 1)
}

async function saveMoment() {
  const content = composer.content.trim()
  if (!content && !composer.images.length) return notify('请输入内容或添加图片', 'error')
  if (content.length > MAX_LEN) return notify(`动态最多 ${MAX_LEN} 字`, 'error')
  try {
    const body = { content, images: composer.images }
    if (composer.id) {
      const res = await api<{ moment: Moment }>(`/moments/${composer.id}`, { method: 'PUT', body })
      const idx = moments.value.findIndex((m) => m.id === composer.id)
      if (idx !== -1) moments.value[idx] = res.moment
      notify('动态已更新', 'success')
    } else {
      const res = await api<{ moment: Moment }>('/moments', { body })
      moments.value.unshift(res.moment)
      notify('动态已发布', 'success')
    }
    composer.open = false
  } catch (e: any) {
    notify(e.message || '保存失败', 'error')
  }
}

async function doDelete() {
  if (!confirmMoment.value) return
  try {
    await api(`/moments/${confirmMoment.value.id}`, { method: 'DELETE' })
    moments.value = moments.value.filter((m) => m.id !== confirmMoment.value!.id)
    notify('动态已删除', 'success')
  } catch (e: any) {
    notify(e.message || '删除失败', 'error')
  } finally {
    confirmMoment.value = null
  }
}

function openLightbox(images: string[], index: number) {
  lightbox.images = images
  lightbox.index = index
  lightbox.open = true
}
</script>

<template>
  <div class="moments-page md-container">
    <header class="moments-head">
      <div>
        <span class="md-label">MOMENTS</span>
        <h1 class="md-headline">{{ routeUsername ? `@${routeUsername} 的动态` : '动态' }}</h1>
        <p class="md-muted">记录当下 · 共 {{ moments.length }} 条</p>
      </div>
      <button v-if="canCompose" class="btn btn-filled" @click="openComposer()">
        <AppIcon name="add" :size="18" />发布动态
      </button>
    </header>

    <div v-if="loading" class="moments-grid">
      <div v-for="i in 6" :key="i" class="skeleton" style="height: 220px; border-radius: 24px; margin-bottom: 20px" />
    </div>

    <div v-else-if="moments.length" class="moments-grid">
      <article v-for="m in moments" :key="m.id" :id="`moment-${m.id}`" class="moment-card">
        <p v-if="m.content" class="moment-text">{{ m.content }}</p>

        <div v-if="m.images.length" class="moment-images" :class="`count-${m.images.length}`">
          <img
            v-for="(img, i) in m.images"
            :key="i"
            :src="img"
            alt=""
            loading="lazy"
            @click="openLightbox(m.images, i)"
          />
        </div>

        <footer class="moment-foot">
          <time class="md-muted">{{ formatRelative(m.created_at) }}</time>
          <div v-if="auth.user && (auth.user.role === 'admin' || m.author_id === auth.user.id)" class="moment-admin">
            <button class="icon-btn sm" title="编辑" @click="openComposer(m)">
              <AppIcon name="edit" :size="16" />
            </button>
            <button class="icon-btn sm danger" title="删除" @click="confirmMoment = m">
              <AppIcon name="delete" :size="16" />
            </button>
          </div>
        </footer>
      </article>
    </div>

    <div v-else class="empty-state">
      <AppIcon name="chat" :size="36" />
      <p>还没有任何动态</p>
      <button v-if="canCompose" class="btn btn-tonal btn-sm" @click="openComposer()">
        <AppIcon name="add" :size="16" />发布第一条
      </button>
    </div>

    <!-- composer -->
    <BaseDialog :open="composer.open" :title="composer.id ? '编辑动态' : '发布动态'" @close="composer.open = false">
      <textarea
        v-model="composer.content"
        class="moment-input"
        :maxlength="MAX_LEN"
        placeholder="分享此刻的想法…（最多 200 字，不支持 Markdown）"
      />
      <div class="moment-counter" :class="{ warn: remaining < 20 }">{{ composer.content.length }} / {{ MAX_LEN }}</div>

      <div class="moment-uploads">
        <div v-for="(img, i) in composer.images" :key="i" class="upload-thumb">
          <img :src="img" alt="" />
          <button class="upload-remove" @click="removeImage(i)">
            <AppIcon name="close" :size="15" />
          </button>
        </div>
        <label v-if="composer.images.length < MAX_IMAGES" class="upload-add">
          <span v-if="composer.uploading" class="spinner" style="width: 16px; height: 16px" />
          <AppIcon v-else name="add" :size="22" />
          <input type="file" accept="image/*" multiple hidden @change="onPickImages" />
        </label>
      </div>
      <p class="md-muted tiny">最多 4 张图片，点图片可放大查看。</p>

      <template #actions>
        <button class="btn" @click="composer.open = false">取消</button>
        <button class="btn btn-filled" :disabled="composer.uploading" @click="saveMoment">
          <AppIcon name="check" :size="16" />{{ composer.id ? '保存' : '发布' }}
        </button>
      </template>
    </BaseDialog>

    <!-- delete confirm -->
    <BaseDialog :open="!!confirmMoment" title="删除动态" @close="confirmMoment = null">
      <p>确定要删除这条动态吗？此操作无法撤销。</p>
      <template #actions>
        <button class="btn" @click="confirmMoment = null">取消</button>
        <button class="btn btn-danger" @click="doDelete"><AppIcon name="delete" :size="16" />删除</button>
      </template>
    </BaseDialog>

    <ImageLightbox
      :open="lightbox.open"
      :images="lightbox.images"
      :index="lightbox.index"
      @close="lightbox.open = false"
      @update:index="lightbox.index = $event"
    />
  </div>
</template>

<style scoped>
.moments-page {
  padding: var(--section-space, 40px) 0 clamp(48px, 10vw, 96px);
}
.moments-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}
.moments-head h1 {
  margin: 2px 0 4px;
}
.moments-grid {
  columns: 3 300px;
  column-gap: clamp(16px, 2vw, 24px);
}
.moment-card {
  break-inside: avoid;
  margin-bottom: 20px;
  padding: 18px;
  background: var(--md-surface-container-low);
  border: 1px solid color-mix(in srgb, var(--md-outline-variant) 50%, transparent);
  border-radius: var(--md-shape-2xl);
  scroll-margin-top: 96px;
  transition: transform var(--md-dur-medium) var(--md-ease-expressive),
    box-shadow var(--md-dur-medium) var(--md-ease-standard);
}
.moment-card.flash {
  animation: moment-flash 1.3s var(--md-ease-standard) 1;
}
@keyframes moment-flash {
  0% {
    box-shadow: 0 0 0 0 transparent;
    border-color: color-mix(in srgb, var(--md-outline-variant) 50%, transparent);
    background: var(--md-surface-container-low);
  }
  15%,
  60% {
    box-shadow: 0 0 0 4px var(--md-primary);
    border-color: var(--md-primary);
    background: color-mix(in srgb, var(--md-primary) 12%, var(--md-surface-container-low));
  }
  37%,
  85% {
    box-shadow: 0 0 0 0 transparent;
    border-color: color-mix(in srgb, var(--md-outline-variant) 50%, transparent);
    background: var(--md-surface-container-low);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
    background: var(--md-surface-container-low);
  }
}
.moment-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--md-elev-2);
}
.moment-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.75;
  font-size: 1.12rem;
}
.moment-images {
  display: grid;
  gap: 4px;
  margin-top: 14px;
  border-radius: var(--md-shape-lg);
  overflow: hidden;
}
.moment-images.count-2 {
  grid-template-columns: 1fr 1fr;
}
.moment-images.count-3 {
  grid-template-columns: repeat(3, 1fr);
}
.moment-images.count-4 {
  grid-template-columns: 1fr 1fr;
}
.moment-images img {
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  display: block;
  cursor: zoom-in;
  background: var(--md-surface-container-high);
  transition: filter var(--md-dur-short) var(--md-ease-standard);
}
.moment-images.count-1 img {
  aspect-ratio: 4 / 3;
}
.moment-images img:hover {
  filter: brightness(0.92);
}
.moment-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 14px;
  font-size: 0.86rem;
}
.moment-admin {
  display: flex;
  gap: 2px;
}
.icon-btn.danger {
  color: var(--md-error);
}

/* composer */
.moment-input {
  width: 100%;
  min-height: 120px;
  padding: 14px;
  border: 1px solid var(--md-outline);
  border-radius: var(--md-shape-lg);
  background: transparent;
  color: var(--md-on-surface);
  resize: vertical;
  line-height: 1.7;
  outline: none;
}
.moment-input:focus {
  border-color: var(--md-primary);
}
.moment-counter {
  text-align: right;
  font-size: 0.76rem;
  color: var(--md-on-surface-variant);
  margin: 6px 2px 14px;
}
.moment-counter.warn {
  color: var(--md-error);
}
.moment-uploads {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 8px;
}
.upload-thumb {
  position: relative;
  width: 84px;
  height: 84px;
  border-radius: var(--md-shape-md);
  overflow: hidden;
  background: var(--md-surface-container-high);
}
.upload-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.upload-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--md-shape-full);
  background: rgb(0 0 0 / 0.55);
  color: #fff;
  cursor: pointer;
}
.upload-add {
  display: grid;
  place-items: center;
  width: 84px;
  height: 84px;
  border: 1.5px dashed var(--md-outline);
  border-radius: var(--md-shape-md);
  color: var(--md-on-surface-variant);
  cursor: pointer;
  transition: border-color var(--md-dur-short) var(--md-ease-standard),
    color var(--md-dur-short) var(--md-ease-standard);
}
.upload-add:hover {
  border-color: var(--md-primary);
  color: var(--md-primary);
}
</style>
