<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import BaseDialog from '@/components/BaseDialog.vue'
import WelcomeBanner from '@/components/WelcomeBanner.vue'
import CardShell from '@/components/CardShell.vue'
import ProfileCard from '@/components/ProfileCard.vue'
import ActivityCard from '@/components/ActivityCard.vue'
import LatestPostsCard from '@/components/LatestPostsCard.vue'
import MarkdownCard from '@/components/MarkdownCard.vue'
import LinksCard from '@/components/LinksCard.vue'
import PluginView from '@/components/PluginView.vue'
import { api } from '@/lib/api'
import { useDragSort } from '@/lib/useDragSort'
import { auth } from '@/stores/auth'
import { notify } from '@/stores/toast'
import { plugins, findPlugin } from '@/lib/plugins'
import type { Card, CardType, LinkItem, Post, RuntimePlugin } from '@/lib/types'

const cards = ref<Card[]>([])
const posts = ref<Post[]>([])
const loading = ref(true)

const editMode = ref(false)
const editDialog = ref(false)
const addDialog = ref(false)
const confirmCard = ref<Card | null>(null)

const draft = ref<Card | null>(null)
const newCard = reactive<{ type: string; title: string; width: 'half' | 'full' }>({
  type: 'markdown',
  title: '',
  width: 'half',
})

function selectAddOption(opt: { type: string; label: string }) {
  newCard.type = opt.type
  if (opt.type.startsWith('plugin:') && !newCard.title) newCard.title = opt.label
}

const ICON_OPTIONS = ['link', 'github', 'steam', 'nintendo', 'globe', 'code', 'article', 'chat', 'star', 'favorite', 'person', 'image']

const BUILTIN_TYPES: { type: CardType; label: string; desc: string; icon: string }[] = [
  { type: 'profile', label: '个人资料', desc: '头像、昵称与简介', icon: 'person' },
  { type: 'activity', label: '个人活动', desc: 'GitHub / Steam / Nintendo', icon: 'history' },
  { type: 'posts', label: '帖子列表', desc: '展示最新博客文章', icon: 'article' },
  { type: 'markdown', label: '自定义文本', desc: '用 Markdown 自由排版', icon: 'edit' },
  { type: 'links', label: '链接集合', desc: '集中展示你的常用链接', icon: 'link' },
]

// Every available card type: built-ins plus each plugin widget as its own type.
const CARD_TYPES = computed<{ type: string; label: string; desc: string; icon: string }[]>(() => {
  const types = BUILTIN_TYPES.map((t) => ({ ...t, type: t.type as string }))
  for (const p of plugins.list) {
    for (const w of p.widgets || []) {
      types.push({
        type: `plugin:${p.id}:${w.id}`,
        label: w.title,
        desc: `插件 · ${p.name}`,
        icon: 'extension',
      })
    }
  }
  return types
})

function pluginWidgetFor(card: Card): { plugin: RuntimePlugin; widgetId: string } | null {
  if (!card.type.startsWith('plugin:')) return null
  const [, pluginId, widgetId] = card.type.split(':')
  const plugin = findPlugin(pluginId)
  return plugin ? { plugin, widgetId } : null
}

function pluginFor(card: Card): RuntimePlugin | undefined {
  return card.config?.pluginId ? findPlugin(card.config.pluginId) : undefined
}

const pluginSources = computed(() => {
  const id = draft.value?.config?.pluginId
  return id ? findPlugin(id)?.cardSources.map((s) => s.id) || [] : []
})

const pluginWidgetOptions = computed(() => {
  const id = draft.value?.config?.pluginId
  return id ? findPlugin(id)?.widgets || [] : []
})

const visibleCards = computed(() => (auth.user ? cards.value : cards.value.filter((c) => c.visible)))

const { dragId, overId, dragstart, dragover, drop, reset } = useDragSort(
  () => cards.value,
  async (order) => {
    const map = new Map(cards.value.map((c) => [c.id, c]))
    cards.value = order.map((id) => map.get(id)!).filter(Boolean)
    try {
      const res = await api<{ cards: Card[] }>('/cards/reorder', { method: 'PUT', body: { order } })
      cards.value = res.cards
    } catch {
      notify('排序保存失败', 'error')
    }
  }
)

async function loadCards() {
  try {
    const res = await api<{ cards: Card[] }>('/cards', { auth: false })
    cards.value = res.cards
  } catch {
    notify('卡片加载失败', 'error')
  }
}

async function loadPosts() {
  try {
    const all = auth.user ? '&all=1' : ''
    const res = await api<{ posts: Post[] }>(`/posts?limit=6${all}`, { auth: false })
    posts.value = res.posts
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  await Promise.all([loadCards(), loadPosts()])
  loading.value = false
})

function openEdit(card: Card) {
  const d: Card = JSON.parse(JSON.stringify(card))
  if (d.type === 'links' && !Array.isArray(d.config.links)) d.config.links = []
  if (d.type === 'activity' && !Array.isArray(d.config.providers)) {
    d.config.providers = ['github', 'steam', 'nintendo']
  }
  if (d.type === 'posts' && !d.config.limit) d.config.limit = 3
  if (d.type === 'markdown' && d.config.body === undefined) d.config.body = ''
  if (d.type === 'plugin') {
    if (d.config.pluginId === undefined) d.config.pluginId = ''
    if (d.config.source === undefined) d.config.source = ''
  }
  if (d.type === 'plugin-widget') {
    if (d.config.pluginId === undefined) d.config.pluginId = ''
    if (d.config.widgetId === undefined) d.config.widgetId = ''
  }
  draft.value = d
  editDialog.value = true
}

async function saveEdit() {
  if (!draft.value) return
  const d = draft.value
  try {
    const res = await api<{ card: Card }>(`/cards/${d.id}`, {
      method: 'PUT',
      body: { title: d.title, width: d.width, config: d.config, visible: d.visible },
    })
    const idx = cards.value.findIndex((c) => c.id === d.id)
    if (idx !== -1) cards.value[idx] = res.card
    editDialog.value = false
    notify('卡片已更新', 'success')
  } catch (e: any) {
    notify(e.message || '保存失败', 'error')
  }
}

async function toggleVisible(card: Card) {
  try {
    const res = await api<{ card: Card }>(`/cards/${card.id}`, {
      method: 'PUT',
      body: { visible: !card.visible },
    })
    const idx = cards.value.findIndex((c) => c.id === card.id)
    if (idx !== -1) cards.value[idx] = res.card
  } catch (e: any) {
    notify(e.message || '操作失败', 'error')
  }
}

async function doDelete() {
  if (!confirmCard.value) return
  const card = confirmCard.value
  try {
    await api(`/cards/${card.id}`, { method: 'DELETE' })
    cards.value = cards.value.filter((c) => c.id !== card.id)
    confirmCard.value = null
    notify('卡片已删除', 'success')
  } catch (e: any) {
    notify(e.message || '删除失败', 'error')
  }
}

async function addCard() {
  try {
    const res = await api<{ card: Card }>('/cards', {
      method: 'POST',
      body: { type: newCard.type, title: newCard.title, width: newCard.width },
    })
    cards.value.push(res.card)
    addDialog.value = false
    newCard.type = 'markdown'
    newCard.title = ''
    newCard.width = 'half'
    notify('卡片已添加', 'success')
  } catch (e: any) {
    notify(e.message || '添加失败', 'error')
  }
}

function addLinkRow() {
  if (!draft.value) return
  const links = (draft.value.config.links as LinkItem[]) || []
  links.push({ label: '', url: '', icon: 'link' })
  draft.value.config.links = links
}
function removeLinkRow(i: number) {
  if (!draft.value) return
  const links = (draft.value.config.links as LinkItem[]) || []
  links.splice(i, 1)
}
function toggleProvider(p: string) {
  if (!draft.value) return
  const set = new Set<string>(draft.value.config.providers || [])
  set.has(p) ? set.delete(p) : set.add(p)
  draft.value.config.providers = ['github', 'steam', 'nintendo'].filter((x) => set.has(x))
}
</script>

<template>
  <div class="home">
    <WelcomeBanner />

    <div class="md-container home-body">
      <div class="section-bar">
        <div>
          <span class="md-label">HOME</span>
          <h2 class="md-headline">个人概览</h2>
        </div>
        <div v-if="auth.user" class="layout-tools">
          <button
            class="btn btn-sm"
            :class="editMode ? 'btn-filled' : 'btn-outlined'"
            @click="editMode = !editMode"
          >
            <AppIcon :name="editMode ? 'check' : 'drag'" :size="16" />
            {{ editMode ? '完成布局' : '编辑布局' }}
          </button>
          <button v-if="editMode" class="btn btn-tonal btn-sm" @click="addDialog = true">
            <AppIcon name="add" :size="16" />添加卡片
          </button>
        </div>
      </div>

      <div v-if="loading" class="card-grid">
        <div v-for="i in 3" :key="i" class="skeleton" style="height: 220px; border-radius: 24px" />
      </div>

      <div v-else class="card-grid">
        <CardShell
          v-for="card in visibleCards"
          :key="card.id"
          :card="card"
          :editable="editMode"
          :dragging="dragId === card.id"
          :over="overId === card.id"
          @dragstart="dragstart(card.id, $event)"
          @dragover="dragover(card.id, $event)"
          @drop="drop(card.id, $event)"
          @dragend="reset"
          @edit="openEdit(card)"
          @remove="confirmCard = card"
          @toggle="toggleVisible(card)"
        >
          <ProfileCard v-if="card.type === 'profile'" />
          <ActivityCard v-else-if="card.type === 'activity'" :card="card" />
          <LatestPostsCard
            v-else-if="card.type === 'posts'"
            :posts="posts"
            :limit="card.config.limit || 3"
          />
          <MarkdownCard v-else-if="card.type === 'markdown'" :body="card.config.body" />
          <LinksCard v-else-if="card.type === 'links'" :links="card.config.links" />
          <PluginView
            v-else-if="pluginWidgetFor(card)"
            :plugin="(pluginWidgetFor(card) as any).plugin"
            :id="(pluginWidgetFor(card) as any).widgetId"
            kind="widget"
            :title="card.title"
          />
          <p v-else-if="card.type.startsWith('plugin:')" class="md-muted">插件未启用，无法显示该小组件</p>
          <PluginView
            v-else-if="card.type === 'plugin' && pluginFor(card)"
            :plugin="pluginFor(card) as RuntimePlugin"
            :source="card.config.source"
            kind="widget"
            :title="card.title"
          />
          <p v-else-if="card.type === 'plugin'" class="md-muted">未选择插件数据源（点编辑选择）</p>
          <PluginView
            v-else-if="card.type === 'plugin-widget' && pluginFor(card)"
            :plugin="pluginFor(card) as RuntimePlugin"
            kind="widget"
            :title="card.title"
          />
          <p v-else-if="card.type === 'plugin-widget'" class="md-muted">未选择插件小组件（点编辑选择）</p>
          <p v-else class="md-muted">未知卡片类型：{{ card.type }}</p>
        </CardShell>
      </div>

      <div v-if="!loading && !visibleCards.length" class="empty-state">
        <AppIcon name="widgets" :size="32" />
        <p>首页还没有任何卡片</p>
        <button v-if="auth.user" class="btn btn-tonal btn-sm" @click="editMode = true; addDialog = true">
          <AppIcon name="add" :size="16" />添加卡片
        </button>
      </div>
    </div>

    <!-- edit card -->
    <BaseDialog :open="editDialog" title="编辑卡片" @close="editDialog = false">
      <template v-if="draft">
        <label class="field filled">
          <input v-model="draft.title" class="field-input" placeholder=" " />
          <span class="field-label">卡片标题</span>
        </label>

        <div class="form-row">
          <span class="form-label">卡片宽度</span>
          <div class="segmented">
            <button :class="{ active: draft.width === 'half' }" @click="draft.width = 'half'">半宽</button>
            <button :class="{ active: draft.width === 'full' }" @click="draft.width = 'full'">整行</button>
          </div>
        </div>

        <label class="switch form-row">
          <input type="checkbox" v-model="draft.visible" />
          <span class="switch-track"><span class="switch-thumb" /></span>
          <span>在首页显示</span>
        </label>

        <div class="divider" />

        <template v-if="draft.type === 'activity'">
          <span class="form-label">显示的平台</span>
          <div class="provider-row">
            <button
              v-for="p in ['github', 'steam', 'nintendo']"
              :key="p"
              class="chip"
              :class="{ active: (draft.config.providers || []).includes(p) }"
              @click="toggleProvider(p)"
            >
              {{ p }}
            </button>
          </div>
        </template>

        <template v-else-if="draft.type === 'posts'">
          <label class="field filled">
            <input v-model.number="draft.config.limit" type="number" min="1" max="10" class="field-input" placeholder=" " />
            <span class="field-label">显示帖子数量</span>
          </label>
        </template>

        <template v-else-if="draft.type === 'markdown'">
          <label class="field filled">
            <textarea v-model="draft.config.body" class="field-input" placeholder=" " style="min-height: 140px" />
            <span class="field-label">内容（支持 Markdown）</span>
          </label>
        </template>

        <template v-else-if="draft.type === 'links'">
          <div class="form-label">链接列表</div>
          <div v-for="(link, i) in (draft.config.links || [])" :key="i" class="link-row">
            <input v-model="link.label" class="mini-input" placeholder="名称" />
            <input v-model="link.url" class="mini-input grow" placeholder="https://" />
            <select v-model="link.icon" class="mini-input">
              <option v-for="ic in ICON_OPTIONS" :key="ic" :value="ic">{{ ic }}</option>
            </select>
            <button class="icon-btn sm" @click="removeLinkRow(i)"><AppIcon name="close" :size="16" /></button>
          </div>
          <button class="btn btn-outlined btn-sm" @click="addLinkRow">
            <AppIcon name="add" :size="16" />添加链接
          </button>
        </template>

        <template v-else-if="draft.type === 'plugin'">
          <label class="field filled">
            <select v-model="draft.config.pluginId" class="field-input">
              <option value="">选择插件</option>
              <option v-for="p in plugins.list" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <span class="field-label">插件</span>
          </label>
          <label class="field filled">
            <select v-model="draft.config.source" class="field-input">
              <option value="">选择数据源</option>
              <option v-for="s in pluginSources" :key="s" :value="s">{{ s }}</option>
            </select>
            <span class="field-label">数据源</span>
          </label>
          <p class="md-muted tiny">数据源由插件通过 app.js 的 registerCardSource 提供。</p>
        </template>

        <template v-else-if="draft.type === 'plugin-widget'">
          <label class="field filled">
            <select v-model="draft.config.pluginId" class="field-input">
              <option value="">选择插件</option>
              <option v-for="p in plugins.list" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <span class="field-label">插件</span>
          </label>
          <label class="field filled">
            <select v-model="draft.config.widgetId" class="field-input">
              <option value="">选择小组件</option>
              <option v-for="w in pluginWidgetOptions" :key="w.id" :value="w.id">{{ w.title }}</option>
            </select>
            <span class="field-label">小组件</span>
          </label>
        </template>
      </template>

      <template #actions>
        <button class="btn" @click="editDialog = false">取消</button>
        <button class="btn btn-filled" @click="saveEdit"><AppIcon name="save" :size="16" />保存</button>
      </template>
    </BaseDialog>

    <!-- add card -->
    <BaseDialog :open="addDialog" title="添加卡片" @close="addDialog = false">
      <div class="type-grid">
        <button
          v-for="t in CARD_TYPES"
          :key="t.type"
          class="type-option"
          :class="{ active: newCard.type === t.type }"
          @click="selectAddOption(t)"
        >
          <span class="type-icon"><AppIcon :name="t.icon" :size="22" /></span>
          <strong>{{ t.label }}</strong>
          <span class="md-muted">{{ t.desc }}</span>
        </button>
      </div>

      <label class="field filled">
        <input v-model="newCard.title" class="field-input" placeholder=" " />
        <span class="field-label">卡片标题</span>
      </label>
      <div class="form-row">
        <span class="form-label">卡片宽度</span>
        <div class="segmented">
          <button :class="{ active: newCard.width === 'half' }" @click="newCard.width = 'half'">半宽</button>
          <button :class="{ active: newCard.width === 'full' }" @click="newCard.width = 'full'">整行</button>
        </div>
      </div>

      <template #actions>
        <button class="btn" @click="addDialog = false">取消</button>
        <button class="btn btn-filled" @click="addCard"><AppIcon name="add" :size="16" />添加</button>
      </template>
    </BaseDialog>

    <!-- delete confirm -->
    <BaseDialog :open="!!confirmCard" title="删除卡片" @close="confirmCard = null">
      <p>确定要删除「{{ confirmCard?.title || confirmCard?.type }}」这张卡片吗？此操作无法撤销。</p>
      <template #actions>
        <button class="btn" @click="confirmCard = null">取消</button>
        <button class="btn btn-danger" @click="doDelete"><AppIcon name="delete" :size="16" />删除</button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.home-body {
  padding: 40px 0 80px;
}
.section-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.section-bar h2 {
  margin-top: 2px;
}
.layout-tools {
  display: flex;
  gap: 8px;
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 20px;
}
.form-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 18px 0;
}
.form-label {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--md-on-surface-variant);
  margin-bottom: 8px;
}
.form-row .form-label {
  margin-bottom: 0;
}
.provider-row {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.provider-row .chip {
  text-transform: capitalize;
}
.link-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.mini-input {
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--md-outline);
  border-radius: var(--md-shape-sm);
  background: transparent;
  min-width: 0;
}
.mini-input.grow {
  flex: 1;
}
.type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.type-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 16px;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-lg);
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: var(--md-on-surface);
  transition: border-color var(--md-dur-short) var(--md-ease-standard),
    background-color var(--md-dur-short) var(--md-ease-standard);
}
.type-option:hover {
  background: color-mix(in srgb, var(--md-on-surface) 5%, transparent);
}
.type-option.active {
  border-color: var(--md-primary);
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}
.type-option .md-muted {
  font-size: 0.78rem;
}
.type-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--md-shape-md);
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
  margin-bottom: 6px;
}
@media (max-width: 640px) {
  .link-row {
    flex-wrap: wrap;
  }
}
</style>
