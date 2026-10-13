<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed, onMounted, reactive, ref, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import BaseDialog from '@/components/BaseDialog.vue'
import { api, uploadFile } from '@/lib/api'
import { renderMarkdown } from '@/lib/markdown'
import { readingTime } from '@/lib/format'
import { notify } from '@/stores/toast'
import { site } from '@/stores/site'
import { plugins } from '@/lib/plugins'
import type { Post, RuntimePlugin } from '@/lib/types'

const route = useRoute()
const router = useRouter()

const isEdit = computed(() => route.name === 'edit')
const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const previewMode = ref<'edit' | 'split' | 'preview'>('split')
const deleteOpen = ref(false)
const tagInput = ref('')

const textarea = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const form = reactive({
  id: 0,
  title: '',
  slug: '',
  summary: '',
  cover: '',
  category: '',
  status: 'published' as Post['status'],
  content: '',
  tags: [] as string[],
})

const previewHtml = computed(() => renderMarkdown(form.content))
const minutes = computed(() => readingTime(form.content))

const editorTools = computed(() =>
  plugins.list.flatMap((p) => (p.editorTools || []).map((tool) => ({ plugin: p, tool })))
)

function insertPluginModule(plugin: RuntimePlugin) {
  const mod = plugin.postModules?.[0]
  if (!mod) {
    notify('该插件没有可嵌入的帖子模块', 'error')
    return
  }
  insertAtCursor(`\n[[plugin:${plugin.id}/${mod.id}]]\n`)
}

async function load() {
  if (!isEdit.value) return
  loading.value = true
  try {
    const res = await api<{ posts: Post[] }>('/posts?all=1&limit=200')
    const found = res.posts.find((p) => String(p.id) === String(route.params.id))
    if (!found) {
      notify('找不到该帖子', 'error')
      router.replace('/blog')
      return
    }
    Object.assign(form, {
      id: found.id,
      title: found.title,
      slug: found.slug,
      summary: found.summary,
      cover: found.cover,
      category: found.category || '',
      status: found.status,
      content: found.content,
      tags: [...found.tags],
    })
  } catch (e: any) {
    notify(e.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)

function addTag() {
  const t = tagInput.value.trim().replace(/^#/, '')
  if (t && !form.tags.includes(t)) form.tags.push(t)
  tagInput.value = ''
}
function removeTag(t: string) {
  form.tags = form.tags.filter((x) => x !== t)
}

function insertAtCursor(text: string) {
  const el = textarea.value
  if (!el) {
    form.content += text
    return
  }
  const start = el.selectionStart
  const end = el.selectionEnd
  form.content = form.content.slice(0, start) + text + form.content.slice(end)
  nextTick(() => {
    el.focus()
    el.selectionStart = el.selectionEnd = start + text.length
  })
}

function wrapSelection(before: string, after = '', placeholder = '') {
  const el = textarea.value
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const selected = form.content.slice(start, end) || placeholder
  const text = before + selected + after
  form.content = form.content.slice(0, start) + text + form.content.slice(end)
  nextTick(() => {
    el.focus()
    el.selectionStart = start + before.length
    el.selectionEnd = start + before.length + selected.length
  })
}

const TOOLBAR = [
  { icon: 'format_bold', title: '加粗', run: () => wrapSelection('**', '**', '粗体') },
  { icon: 'format_italic', title: '斜体', run: () => wrapSelection('_', '_', '斜体') },
  { icon: 'title', title: '标题', run: () => insertAtCursor('\n## 标题\n') },
  { icon: 'link', title: '链接', run: () => wrapSelection('[', '](https://)', '链接文字') },
  { icon: 'code', title: '代码块', run: () => insertAtCursor('\n```\ncode\n```\n') },
  { icon: 'format_list', title: '列表', run: () => insertAtCursor('\n- 列表项\n- 列表项\n') },
]

async function handleImageFile(file: File) {
  if (!file.type.startsWith('image/')) {
    notify('请选择图片文件', 'error')
    return
  }
  uploading.value = true
  try {
    const res = await uploadFile(file)
    const alt = file.name.replace(/\.[^.]+$/, '')
    insertAtCursor(`\n![${alt}](${res.url})\n`)
    notify('图片已插入', 'success')
  } catch (e: any) {
    notify(e.message || '图片上传失败', 'error')
  } finally {
    uploading.value = false
  }
}

function onPickImage() {
  fileInput.value?.click()
}
function onFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files?.[0]) handleImageFile(files[0])
  ;(e.target as HTMLInputElement).value = ''
}

async function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (file) await handleImageFile(file)
      return
    }
  }
}

async function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    e.preventDefault()
    await handleImageFile(file)
  }
}

async function onCoverChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const res = await uploadFile(file)
    form.cover = res.url
    notify('封面已更新', 'success')
  } catch (err: any) {
    notify(err.message || '上传失败', 'error')
  } finally {
    uploading.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

async function save() {
  if (!form.title.trim()) return notify('请填写标题', 'error')
  saving.value = true
  try {
    const body = {
      title: form.title.trim(),
      slug: form.slug.trim() || undefined,
      summary: form.summary,
      cover: form.cover,
      category: form.category,
      content: form.content,
      tags: form.tags,
      status: form.status,
    }
    if (form.id) {
      const res = await api<{ post: Post }>(`/posts/${form.id}`, { method: 'PUT', body })
      form.id = res.post.id
      form.slug = res.post.slug
      notify('帖子已保存', 'success')
    } else {
      const res = await api<{ post: Post }>('/posts', { body })
      form.id = res.post.id
      form.slug = res.post.slug
      notify('帖子已发布', 'success')
      router.replace({ name: 'edit', params: { id: res.post.id } })
    }
  } catch (e: any) {
    notify(e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function doDelete() {
  if (!form.id) return
  try {
    await api(`/posts/${form.id}`, { method: 'DELETE' })
    notify('帖子已删除', 'success')
    router.push('/blog')
  } catch (e: any) {
    notify(e.message || '删除失败', 'error')
  }
}

function goBack() {
  router.push('/blog')
}
</script>

<template>
  <div class="editor-page md-container">
    <header class="editor-head">
      <div>
        <button class="back-link" @click="goBack">
          <AppIcon name="arrow_back" :size="18" />返回博客
        </button>
        <h1 class="md-headline">{{ isEdit ? '编辑帖子' : '撰写新帖子' }}</h1>
      </div>
      <div class="head-actions">
        <div class="segmented status-seg">
          <button :class="{ active: form.status === 'published' }" @click="form.status = 'published'">
            <AppIcon name="visibility" :size="15" />公开
          </button>
          <button :class="{ active: form.status === 'draft' }" @click="form.status = 'draft'">
            <AppIcon name="edit" :size="15" />草稿
          </button>
          <button :class="{ active: form.status === 'hidden' }" @click="form.status = 'hidden'">
            <AppIcon name="visibility_off" :size="15" />隐藏
          </button>
        </div>
        <button v-if="form.id" class="icon-btn" title="删除" @click="deleteOpen = true">
          <AppIcon name="delete" :size="20" />
        </button>
        <button class="btn btn-filled" :disabled="saving" @click="save">
          <span v-if="saving" class="spinner" style="width: 16px; height: 16px" />
          <AppIcon v-else name="save" :size="18" />
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </header>

    <div class="editor-meta card">
      <label class="field filled slim">
        <input v-model="form.title" class="field-input title-input" placeholder=" " />
        <span class="field-label">标题 *</span>
      </label>

      <div class="meta-grid">
        <label class="field filled slim">
          <select v-model="form.category" class="field-input">
            <option value="">未分类</option>
            <option v-for="c in site.categories" :key="c" :value="c">{{ c }}</option>
          </select>
          <span class="field-label">分类</span>
        </label>
        <label class="field filled slim">
          <input v-model="form.slug" class="field-input" placeholder=" " />
          <span class="field-label">URL 别名（留空自动生成）</span>
        </label>
        <label class="field filled slim">
          <input v-model="form.summary" class="field-input" placeholder=" " />
          <span class="field-label">摘要</span>
        </label>
      </div>

      <div class="meta-row">
        <div class="tags-editor">
          <span class="mini-label">标签</span>
          <span v-for="t in form.tags" :key="t" class="chip active">
            #{{ t }}
            <button class="chip-x" @click="removeTag(t)"><AppIcon name="close" :size="13" /></button>
          </span>
          <input
            v-model="tagInput"
            class="tag-input"
            placeholder="输入后回车"
            @keydown.enter.prevent="addTag"
            @keydown.delete="!tagInput && form.tags.pop()"
            @blur="addTag"
          />
        </div>
        <div class="cover-editor">
          <span class="mini-label">封面</span>
          <div v-if="form.cover" class="cover-preview" :style="{ backgroundImage: `url(${form.cover})` }">
            <button class="icon-btn sm" @click="form.cover = ''"><AppIcon name="close" :size="15" /></button>
          </div>
          <label class="btn btn-outlined btn-sm cover-btn">
            <AppIcon name="upload" :size="15" />上传封面
            <input type="file" accept="image/*" hidden @change="onCoverChange" />
          </label>
        </div>
      </div>
    </div>

    <div class="editor-main card">
      <div class="editor-bar">
        <div class="toolbar">
          <button
            v-for="(b, i) in TOOLBAR"
            :key="i"
            class="icon-btn sm"
            :title="b.title"
            @click="b.run()"
          >
            <AppIcon :name="b.icon" :size="17" />
          </button>
          <span class="tool-sep" />
          <button class="btn btn-tonal btn-sm" :disabled="uploading" @click="onPickImage">
            <span v-if="uploading" class="spinner" style="width: 14px; height: 14px" />
            <AppIcon v-else name="image" :size="16" />
            插入图片
          </button>
          <span v-if="editorTools.length" class="tool-sep" />
          <button
            v-for="pt in editorTools"
            :key="`${pt.plugin.id}-${pt.tool.id}`"
            class="btn btn-outlined btn-sm"
            :title="`插入插件模块：${pt.plugin.name}`"
            @click="insertPluginModule(pt.plugin)"
          >
            <AppIcon :name="pt.tool.icon || 'extension'" :size="16" />{{ pt.tool.label }}
          </button>
          <input ref="fileInput" type="file" accept="image/*" hidden @change="onFileChange" />
        </div>
        <div class="preview-toggle segmented">
          <button :class="{ active: previewMode === 'edit' }" @click="previewMode = 'edit'">编辑</button>
          <button :class="{ active: previewMode === 'split' }" @click="previewMode = 'split'">双栏</button>
          <button :class="{ active: previewMode === 'preview' }" @click="previewMode = 'preview'">预览</button>
        </div>
      </div>

      <div class="editor-workspace" :class="`mode-${previewMode}`">
        <div v-show="previewMode !== 'preview'" class="pane">
          <textarea
            ref="textarea"
            v-model="form.content"
            class="md-input"
            placeholder="开始用 Markdown 写作…&#10;&#10;支持拖拽或粘贴图片直接上传。"
            @paste="onPaste"
            @drop="onDrop"
            @dragover.prevent
          />
        </div>
        <div v-show="previewMode !== 'edit'" class="pane preview-pane">
          <div class="md-content" v-html="previewHtml" />
          <p v-if="!form.content" class="md-muted preview-empty">预览将显示在这里</p>
        </div>
      </div>

      <div class="editor-foot">
        <span class="md-muted">约 {{ minutes }} 分钟阅读 · {{ form.content.length }} 字符</span>
      </div>
    </div>

    <BaseDialog :open="deleteOpen" title="删除帖子" @close="deleteOpen = false">
      <p>确定要删除「{{ form.title }}」吗？此操作无法撤销。</p>
      <template #actions>
        <button class="btn" @click="deleteOpen = false">取消</button>
        <button class="btn btn-danger" @click="doDelete"><AppIcon name="delete" :size="16" />删除</button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.editor-page {
  padding: clamp(24px, 4vw, 40px) 0 clamp(48px, 10vw, 96px);
}
.editor-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  color: var(--md-on-surface-variant);
  cursor: pointer;
  padding: 0;
  font-size: 0.86rem;
  margin-bottom: 6px;
}
.back-link:hover {
  color: var(--md-primary);
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-seg button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.82rem;
  padding: 0 12px;
}
.editor-meta {
  margin-bottom: 20px;
}
.title-input {
  font-size: 1.25rem;
  font-weight: 600;
}
.field.slim > .field-input {
  min-height: 52px;
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.meta-row {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.mini-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--md-on-surface-variant);
  margin-bottom: 8px;
}
.tags-editor {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
}
.tags-editor .mini-label {
  margin-bottom: 0;
}
.chip-x {
  display: grid;
  place-items: center;
  border: none;
  background: none;
  cursor: pointer;
  color: inherit;
  padding: 0;
}
.tag-input {
  min-width: 120px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--md-outline);
  border-radius: var(--md-shape-full);
  background: transparent;
}
.cover-editor {
  display: flex;
  align-items: center;
  gap: 12px;
}
.cover-editor .mini-label {
  margin-bottom: 0;
}
.cover-preview {
  width: 64px;
  height: 44px;
  border-radius: var(--md-shape-sm);
  background: center/cover no-repeat;
  position: relative;
}
.cover-preview .icon-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  background: var(--md-surface-container-highest);
}
.cover-btn {
  cursor: pointer;
}
.editor-main {
  padding: 0;
  overflow: hidden;
}
.editor-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--md-outline-variant);
  flex-wrap: wrap;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
}
.tool-sep {
  width: 1px;
  height: 22px;
  background: var(--md-outline-variant);
  margin: 0 6px;
}
.editor-workspace {
  display: grid;
  min-height: 460px;
}
.editor-workspace.mode-split {
  grid-template-columns: 1fr 1fr;
}
.pane {
  min-width: 0;
  overflow: auto;
  max-height: 68vh;
}
.mode-split .pane + .pane {
  border-left: 1px solid var(--md-outline-variant);
}
.md-input {
  width: 100%;
  height: 100%;
  min-height: 460px;
  border: none;
  resize: none;
  outline: none;
  padding: 22px;
  background: transparent;
  color: var(--md-on-surface);
  font-family: var(--md-font-mono);
  font-size: 0.92rem;
  line-height: 1.8;
}
.preview-pane {
  padding: 22px;
}
.preview-empty {
  text-align: center;
  padding-top: 40px;
}
.editor-foot {
  padding: 12px 20px;
  border-top: 1px solid var(--md-outline-variant);
  font-size: 0.78rem;
}
.md-content :deep(h1),
.md-content :deep(h2),
.md-content :deep(h3) {
  margin: 1.2em 0 0.5em;
  line-height: 1.3;
}
.md-content :deep(h1):first-child,
.md-content :deep(h2):first-child,
.md-content :deep(h3):first-child {
  margin-top: 0;
}
.md-content :deep(p) {
  margin: 0.8em 0;
}
.md-content :deep(code) {
  font-family: var(--md-font-mono);
  font-size: 0.88em;
  background: var(--md-surface-container-high);
  padding: 2px 6px;
  border-radius: var(--md-shape-xs);
}
.md-content :deep(pre) {
  background: var(--md-surface-container-highest);
  padding: 16px;
  border-radius: var(--md-shape-lg);
  overflow-x: auto;
}
.md-content :deep(pre code) {
  background: none;
  padding: 0;
}
.md-content :deep(blockquote) {
  margin: 1em 0;
  padding: 6px 16px;
  border-left: 4px solid var(--md-primary);
  color: var(--md-on-surface-variant);
}
.md-content :deep(img) {
  border-radius: var(--md-shape-md);
}
.md-content :deep(ul),
.md-content :deep(ol) {
  padding-left: 1.5em;
}
@media (max-width: 900px) {
  .editor-workspace.mode-split {
    grid-template-columns: 1fr;
  }
  .mode-split .pane + .pane {
    border-left: none;
    border-top: 1px solid var(--md-outline-variant);
  }
  .meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
