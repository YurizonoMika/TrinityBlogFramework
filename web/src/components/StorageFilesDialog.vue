<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import BaseDialog from './BaseDialog.vue'
import { api } from '@/lib/api'
import { confirmDialog } from '@/stores/dialog'
import { notify } from '@/stores/toast'

interface FileOwner {
  id: number
  username: string
  name: string
}
interface UploadFile {
  path: string
  url: string
  name: string
  folder: string
  size: number
  mtime: number
  ext: string
  image: boolean
  refs: string[]
  orphan: boolean
  owner: FileOwner | null
}
interface FilesResponse {
  files: UploadFile[]
  total: number
  bytes: number
  offset: number
  limit: number
  all: { count: number; bytes: number }
  orphan: { count: number; bytes: number }
}

const props = defineProps<{ open: boolean; initialOrphan?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>()

const LIMIT = 40
const files = ref<UploadFile[]>([])
const loading = ref(false)
const busy = ref(false)
const orphanOnly = ref(false)
const query = ref('')
const type = ref<string>('all')
const sort = ref<string>('time')
const offset = ref(0)
const total = ref(0)
const bytes = ref(0)
const all = ref({ count: 0, bytes: 0 })
const orphan = ref({ count: 0, bytes: 0 })
const selected = ref<string[]>([])
let requestSeq = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined

const REF_LABEL: Record<string, string> = { post: '帖子', moment: '动态', site: '站点' }

const pages = computed(() => Math.max(1, Math.ceil(total.value / LIMIT)))
const page = computed(() => Math.floor(offset.value / LIMIT) + 1)
const rangeText = computed(() => {
  if (!total.value) return '没有匹配的文件'
  return `${offset.value + 1}–${Math.min(offset.value + files.value.length, total.value)} / ${total.value}`
})
const pageAllSelected = computed(
  () => files.value.length > 0 && files.value.every((f) => selected.value.includes(f.path))
)
const selectedFiles = computed(() => files.value.filter((f) => selected.value.includes(f.path)))

function fmtBytes(n: number): string {
  const v = Number(n) || 0
  if (v < 1024) return `${v} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = v / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`
}
function fmtDate(ms: number): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}
function refLabel(kind: string): string {
  return REF_LABEL[kind] || kind
}

async function load() {
  const seq = ++requestSeq
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (orphanOnly.value) params.set('orphan', '1')
    if (query.value.trim()) params.set('q', query.value.trim())
    if (type.value !== 'all') params.set('type', type.value)
    params.set('sort', sort.value)
    params.set('offset', String(offset.value))
    params.set('limit', String(LIMIT))
    const r = await api<FilesResponse>(`/settings/storage/files?${params.toString()}`)
    if (seq !== requestSeq) return
    files.value = r.files
    total.value = r.total
    bytes.value = r.bytes
    all.value = r.all
    orphan.value = r.orphan
    selected.value = []
  } catch (e: any) {
    if (seq === requestSeq) notify(e?.message || '加载文件列表失败', 'error')
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function resetAndLoad() {
  offset.value = 0
  selected.value = []
  load()
}
function setOrphan(value: boolean) {
  if (orphanOnly.value === value) return
  orphanOnly.value = value
  resetAndLoad()
}
function go(delta: number) {
  const next = offset.value + delta * LIMIT
  if (next < 0 || next >= total.value) return
  offset.value = next
  selected.value = []
  load()
}
function toggleSelect(path: string) {
  const i = selected.value.indexOf(path)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(path)
}
function togglePage() {
  if (pageAllSelected.value) {
    const pagePaths = new Set(files.value.map((f) => f.path))
    selected.value = selected.value.filter((p) => !pagePaths.has(p))
  } else {
    const merged = new Set([...selected.value, ...files.value.map((f) => f.path)])
    selected.value = [...merged]
  }
}

async function removeFiles(entries: UploadFile[]) {
  if (!entries.length || busy.value) return
  const size = entries.reduce((sum, f) => sum + f.size, 0)
  const referenced = entries.filter((f) => f.refs.length).length
  const message =
    entries.length === 1
      ? `确定删除「${entries[0].name}」吗？此操作无法撤销。`
      : `确定删除选中的 ${entries.length} 个文件（${fmtBytes(size)}）吗？此操作无法撤销。`
  const warning = referenced ? ` 其中 ${referenced} 个文件仍被内容引用，删除后相关内容可能无法显示。` : ''
  const ok = await confirmDialog({
    title: '删除文件',
    message: message + warning,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  busy.value = true
  try {
    let removed = entries.length
    if (entries.length === 1) {
      const r = await api<{ removed: number }>(
        `/settings/storage/file?path=${encodeURIComponent(entries[0].path)}`,
        { method: 'DELETE' }
      )
      removed = r.removed
    } else {
      const r = await api<{ removed: number }>('/settings/storage/files/delete', {
        body: { paths: entries.map((f) => f.path) },
      })
      removed = r.removed
    }
    notify(`已删除 ${removed} 个文件`, 'success')
    emit('changed')
    await load()
  } catch (e: any) {
    notify(e?.message || '删除失败', 'error')
  } finally {
    busy.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      requestSeq++
      return
    }
    orphanOnly.value = Boolean(props.initialOrphan)
    query.value = ''
    type.value = 'all'
    sort.value = 'time'
    offset.value = 0
    selected.value = []
    load()
  },
  { immediate: true }
)

watch(query, () => {
  offset.value = 0
  selected.value = []
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 250)
})

watch([type, sort], () => resetAndLoad())

onUnmounted(() => clearTimeout(searchTimer))
</script>

<template>
  <BaseDialog :open="open" title="文件管理" wide @close="emit('close')">
    <div class="files-summary">
      <span><strong>{{ all.count }}</strong> 个上传文件 · {{ fmtBytes(all.bytes) }}</span>
      <button class="orphan-chip" :class="{ active: orphanOnly }" @click="setOrphan(!orphanOnly)">
        孤立文件 {{ orphan.count }} 个 · {{ fmtBytes(orphan.bytes) }}
      </button>
    </div>

    <div class="files-toolbar">
      <div class="segmented">
        <button :class="{ active: !orphanOnly }" @click="setOrphan(false)">全部</button>
        <button :class="{ active: orphanOnly }" @click="setOrphan(true)">仅孤立</button>
      </div>
      <label class="file-search">
        <AppIcon name="search" :size="16" />
        <input v-model="query" type="search" placeholder="搜索文件名或路径" />
      </label>
      <select v-model="type" class="file-select" title="文件类型">
        <option value="all">全部类型</option>
        <option value="image">图片</option>
        <option value="other">其他</option>
      </select>
      <select v-model="sort" class="file-select" title="排序方式">
        <option value="time">最新优先</option>
        <option value="size">大小优先</option>
        <option value="name">名称顺序</option>
      </select>
      <button class="icon-btn sm" title="刷新" :disabled="loading" @click="load">
        <AppIcon name="refresh" :size="18" />
      </button>
    </div>

    <div class="files-list">
      <div class="file-head">
        <label class="file-check">
          <input type="checkbox" aria-label="选择本页全部文件" :checked="pageAllSelected" :disabled="!files.length" @change="togglePage" />
        </label>
        <span class="head-name">文件</span>
        <span class="head-size">大小</span>
      </div>

      <div v-if="loading" class="files-empty">
        <span class="spinner" />
      </div>
      <div v-else-if="!files.length" class="files-empty md-muted">
        {{ orphanOnly ? '没有孤立文件。' : query ? '没有匹配的文件。' : '还没有上传文件。' }}
      </div>

      <template v-else>
        <div v-for="f in files" :key="f.path" class="file-row" :class="{ orphan: f.orphan }">
          <label class="file-check">
            <input type="checkbox" :aria-label="`选择 ${f.name}`" :checked="selected.includes(f.path)" @change="toggleSelect(f.path)" />
          </label>
          <div class="file-thumb">
            <img v-if="f.image" :src="f.url" loading="lazy" alt="" />
            <AppIcon v-else name="article" :size="20" />
          </div>
          <div class="file-main">
            <a class="file-name" :href="f.url" target="_blank" rel="noopener" :title="f.path">{{ f.name }}</a>
            <div class="file-meta">
              <span class="ellipsis">{{ f.folder || 'uploads' }}</span>
              <span v-if="f.owner">@{{ f.owner.username }}</span>
              <span>{{ fmtDate(f.mtime) }}</span>
            </div>
            <div class="file-tags">
              <span v-for="kind in f.refs" :key="kind" class="tag">{{ refLabel(kind) }}</span>
              <span v-if="f.orphan" class="tag tag-orphan">孤立</span>
              <span v-if="f.ext" class="tag tag-ext">{{ f.ext }}</span>
            </div>
          </div>
          <span class="file-size">{{ fmtBytes(f.size) }}</span>
          <div class="file-actions">
            <a class="icon-btn sm" :href="f.url" target="_blank" rel="noopener" title="查看">
              <AppIcon name="visibility" :size="17" />
            </a>
            <a class="icon-btn sm" :href="f.url" :download="f.name" title="下载">
              <AppIcon name="download" :size="17" />
            </a>
            <button class="icon-btn sm danger" title="删除" :disabled="busy" @click="removeFiles([f])">
              <AppIcon name="delete" :size="17" />
            </button>
          </div>
        </div>
      </template>
    </div>

    <div class="files-foot">
      <span class="md-muted">{{ rangeText }} · {{ fmtBytes(bytes) }}</span>
      <div class="pager">
        <button class="btn btn-outlined btn-sm" :disabled="page <= 1 || loading" @click="go(-1)">上一页</button>
        <span class="md-muted">{{ page }} / {{ pages }}</span>
        <button class="btn btn-outlined btn-sm" :disabled="page >= pages || loading" @click="go(1)">下一页</button>
      </div>
    </div>

    <template #actions>
      <button
        v-if="selectedFiles.length"
        class="btn btn-danger"
        :disabled="busy"
        @click="removeFiles(selectedFiles)"
      >
        <AppIcon name="delete" :size="16" />删除选中 {{ selectedFiles.length }} 项
      </button>
      <button class="btn" @click="emit('close')">关闭</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.files-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  font-size: 0.9rem;
}
.orphan-chip {
  border: 1px solid var(--md-outline-variant);
  background: var(--md-surface-container-low);
  color: var(--md-on-surface-variant);
  border-radius: var(--md-shape-full);
  padding: 6px 12px;
  font-size: 0.78rem;
  cursor: pointer;
}
.orphan-chip.active {
  border-color: var(--md-primary);
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}
.files-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.files-toolbar > .icon-btn {
  margin-left: auto;
}
.file-search {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 1 1 170px;
  min-width: 140px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-full);
  background: var(--md-surface);
  color: var(--md-on-surface-variant);
}
.file-search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--md-on-surface);
  font: inherit;
  font-size: 0.86rem;
}
.file-select {
  height: 36px;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-sm);
  background: var(--md-surface);
  color: var(--md-on-surface);
  padding: 0 8px;
  font: inherit;
  font-size: 0.82rem;
}
.files-list {
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-lg);
  max-height: min(46vh, 430px);
  overflow: auto;
}
.file-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--md-surface-container-highest);
  border-bottom: 1px solid var(--md-outline-variant);
  font-size: 0.76rem;
  color: var(--md-on-surface-variant);
}
.file-head .head-name {
  flex: 1;
}
.file-head .head-size {
  width: 72px;
  text-align: right;
}
.file-check {
  display: grid;
  place-items: center;
  flex: none;
}
.file-check input {
  accent-color: var(--md-primary);
}
.file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--md-outline-variant) 45%, transparent);
}
.file-row:last-child {
  border-bottom: none;
}
.file-row.orphan {
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--md-error) 70%, transparent);
}
.file-thumb {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--md-shape-md);
  background: var(--md-surface-container-high);
  color: var(--md-on-surface-variant);
}
.file-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.file-main {
  flex: 1 1 170px;
  min-width: 0;
}
.file-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--md-on-surface);
}
.file-name:hover {
  color: var(--md-primary);
}
.file-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  margin-top: 2px;
  font-size: 0.72rem;
  color: var(--md-on-surface-variant);
}
.file-meta .ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.file-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}
.tag {
  padding: 1px 7px;
  border-radius: var(--md-shape-full);
  background: var(--md-surface-container-higher, var(--md-surface-container-high));
  color: var(--md-on-surface-variant);
  font-size: 0.68rem;
  line-height: 1.6;
}
.tag-orphan {
  background: var(--md-error-container);
  color: var(--md-on-error-container);
}
.tag-ext {
  text-transform: uppercase;
  opacity: 0.75;
}
.file-size {
  flex: none;
  width: 72px;
  text-align: right;
  font-size: 0.78rem;
  color: var(--md-on-surface-variant);
  font-variant-numeric: tabular-nums;
}
.file-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}
.icon-btn.danger {
  color: var(--md-error);
}
.files-empty {
  display: grid;
  place-items: center;
  gap: 8px;
  padding: 36px 16px;
  font-size: 0.86rem;
}
.files-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
  font-size: 0.8rem;
}
.pager {
  display: flex;
  align-items: center;
  gap: 8px;
}
@media (max-width: 560px) {
  .file-head .head-size,
  .file-size {
    display: none;
  }
  .file-main {
    flex-basis: 130px;
  }
}
</style>
