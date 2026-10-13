<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import ImageCropper from '@/components/ImageCropper.vue'
import { api, getToken, uploadFile } from '@/lib/api'
import { auth, setUser } from '@/stores/auth'
import {
  loadFullSettings,
  loadPublicSite,
  saveCategories,
  saveIntegrations,
  saveSiteSettings,
  site,
  toggleTheme,
  applyTheme,
} from '@/stores/site'
import { notify } from '@/stores/toast'
import { confirmDialog } from '@/stores/dialog'
import { loadPlugins } from '@/lib/plugins'
import type { InstalledPlugin, LinkItem, ProfileTag } from '@/lib/types'

const route = useRoute()
const validTabs = ['profile', 'site', 'categories', 'activity', 'plugins', 'account', 'backup'] as const
const tab = ref<(typeof validTabs)[number]>(
  validTabs.includes(route.query.tab as any) ? (route.query.tab as any) : 'profile'
)
const saving = ref(false)
const importing = ref(false)
const importResult = ref<any>(null)
const backupProgress = reactive<{ active: boolean; value: number | null }>({ active: false, value: null })

function progressShow(value: number | null) {
  backupProgress.active = true
  backupProgress.value = value
}
function progressFinish() {
  backupProgress.value = 1
  setTimeout(() => {
    backupProgress.active = false
    backupProgress.value = null
  }, 500)
}
const installedPlugins = ref<InstalledPlugin[]>([])
const pluginBusy = ref(false)

const profile = reactive({ display_name: '', email: '', avatar: '', bio: '' })
const links = ref<LinkItem[]>([])
const profileTags = ref<ProfileTag[]>([])
const categories = ref<string[]>([])
const siteForm = reactive({
  title: '',
  subtitle: '',
  description: '',
  footer: '',
  icon: '',
  banner: '',
  themeMode: 'preset' as 'preset' | 'dynamic',
  themeSource: 'icon' as 'icon' | 'banner' | 'custom',
  themeSeed: '',
})
const uploadingSeed = ref(false)

const crop = reactive({
  open: false,
  src: '',
  aspect: 1,
  width: 512,
  height: 512,
  round: false,
  title: '',
  target: '' as '' | 'avatar' | 'icon' | 'banner',
})

const themeMode = computed(() => site.site.themeMode || 'preset')
const themeSource = computed(() => site.site.themeSource || 'icon')
const github = reactive({ username: '', token: '' })
const steam = reactive({ steamId: '', apiKey: '' })
const nintendo = reactive({
  friendCode: '',
  games: [] as { name: string; playtime?: string }[],
  zncaApiUrl: '',
  clientId: '',
  clientSecret: '',
})

const NSO_DOC_URL = 'https://github.com/YurizonoMika/TrinityBlogFramework#nso-setup'
const account = reactive({ username: '', currentPassword: '', newPassword: '', confirm: '' })

const nintendoStatus = reactive<{ loading: boolean; linked: boolean; user: any }>({
  loading: true,
  linked: false,
  user: null,
})
const naAuth = reactive({ started: false, url: '', state: '', input: '', busy: false })

const ACCENTS = [
  { id: 'violet', color: '#6750a4' },
  { id: 'blue', color: '#0b57d0' },
  { id: 'green', color: '#2e6c3f' },
  { id: 'orange', color: '#8b5000' },
  { id: 'pink', color: '#a3306e' },
  { id: 'teal', color: '#006a6a' },
  { id: 'red', color: '#b3261e' },
  { id: 'cyan', color: '#006874' },
  { id: 'lime', color: '#3f6a00' },
]

const ICON_OPTIONS = ['link', 'github', 'steam', 'nintendo', 'globe', 'code', 'article', 'chat', 'star', 'favorite', 'person', 'image']

const TABS = [
  { id: 'profile', label: '个人资料', icon: 'person' },
  { id: 'site', label: '站点外观', icon: 'palette' },
  { id: 'categories', label: '博客分类', icon: 'article' },
  { id: 'activity', label: '活动集成', icon: 'history' },
  { id: 'plugins', label: '拓展程序', icon: 'extension' },
  { id: 'account', label: '账户安全', icon: 'lock' },
  { id: 'backup', label: '备份与迁移', icon: 'save' },
] as const

async function load() {
  const data = await loadFullSettings()
  const p = data.profile
  profile.display_name = p.display_name || ''
  profile.email = p.email || ''
  profile.avatar = p.avatar || ''
  profile.bio = p.bio || ''
  links.value = (data.links || []).map((l) => ({ ...l }))
  profileTags.value = (data.tags || []).map((t) => ({ ...t }))
  categories.value = [...(data.categories || [])]
  Object.assign(siteForm, {
    title: data.site.title || '',
    subtitle: data.site.subtitle || '',
    description: data.site.description || '',
    footer: data.site.footer || '',
    icon: data.site.icon || '',
    banner: data.site.banner || '',
    themeMode: data.site.themeMode || 'preset',
    themeSource: data.site.themeSource || 'icon',
    themeSeed: data.site.themeSeed || '',
  })
  Object.assign(github, data.integrations.github || {})
  Object.assign(steam, data.integrations.steam || {})
  nintendo.friendCode = data.integrations.nintendo?.friendCode || ''
  nintendo.games = (data.integrations.nintendo?.games || []).map((g) => ({ ...g }))
  nintendo.zncaApiUrl = data.integrations.nintendo?.zncaApiUrl || 'https://nxapi-znca-api.fancy.org.uk/api/znca'
  nintendo.clientId = data.integrations.nintendo?.clientId || ''
  nintendo.clientSecret = data.integrations.nintendo?.clientSecret || ''
  account.username = p.username || ''
}

onMounted(() => {
  load()
  loadNintendoStatus()
  loadInstalledPlugins()
})

async function loadNintendoStatus() {
  try {
    const s = await api<{ linked: boolean; user: any }>('/nintendo/status')
    nintendoStatus.linked = s.linked
    nintendoStatus.user = s.user
  } catch {
    /* ignore */
  } finally {
    nintendoStatus.loading = false
  }
}

async function startNintendoAuth() {
  naAuth.busy = true
  try {
    const r = await api<{ url: string; state: string }>('/nintendo/auth/start', { method: 'POST' })
    naAuth.url = r.url
    naAuth.state = r.state
    naAuth.started = true
    window.open(r.url, '_blank', 'noopener')
  } catch (e: any) {
    notify(e.message || '无法生成授权链接', 'error')
  } finally {
    naAuth.busy = false
  }
}

async function confirmNintendoAuth() {
  if (!naAuth.input.trim()) return notify('请粘贴重定向链接或 session_token_code', 'error')
  naAuth.busy = true
  try {
    const r = await api<{ status: any }>('/nintendo/auth/exchange', {
      method: 'POST',
      body: { input: naAuth.input },
    })
    nintendoStatus.linked = r.status.linked
    nintendoStatus.user = r.status.user
    naAuth.input = ''
    naAuth.started = false
    notify('Nintendo 账户绑定成功，首页活动卡将自动同步', 'success')
  } catch (e: any) {
    notify(e.message || '绑定失败', 'error')
  } finally {
    naAuth.busy = false
  }
}

async function unlinkNintendo() {
  try {
    await api('/nintendo', { method: 'DELETE' })
    nintendoStatus.linked = false
    nintendoStatus.user = null
    notify('已取消绑定 Nintendo 账户', 'success')
  } catch (e: any) {
    notify(e.message || '操作失败', 'error')
  }
}

function startCrop(file: File, target: 'avatar' | 'icon' | 'banner') {
  const cfg = {
    avatar: { aspect: 1, width: 512, height: 512, round: true, title: '裁剪头像' },
    icon: { aspect: 1, width: 512, height: 512, round: false, title: '裁剪站点图标' },
    banner: { aspect: 16 / 7, width: 1920, height: 840, round: false, title: '裁剪站点横幅' },
  }[target]
  if (crop.src) URL.revokeObjectURL(crop.src)
  crop.src = URL.createObjectURL(file)
  crop.aspect = cfg.aspect
  crop.width = cfg.width
  crop.height = cfg.height
  crop.round = cfg.round
  crop.title = cfg.title
  crop.target = target
  crop.open = true
}

function closeCrop() {
  crop.open = false
  if (crop.src) URL.revokeObjectURL(crop.src)
  crop.src = ''
}

async function onCropDone(blob: Blob) {
  const target = crop.target
  crop.open = false
  const file = new File([blob], `${target || 'crop'}.jpg`, { type: blob.type || 'image/jpeg' })
  try {
    const res = await uploadFile(file)
    if (target === 'avatar') {
      profile.avatar = res.url
      await saveProfile()
    } else if (target === 'icon') {
      siteForm.icon = res.url
      await saveSiteSettings({ icon: res.url })
      applyTheme()
    } else if (target === 'banner') {
      siteForm.banner = res.url
      await saveSiteSettings({ banner: res.url })
    }
    notify('图片已更新', 'success')
  } catch (err: any) {
    notify(err.message || '上传失败', 'error')
  } finally {
    if (crop.src) URL.revokeObjectURL(crop.src)
    crop.src = ''
  }
}

function onAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) startCrop(file, 'avatar')
  ;(e.target as HTMLInputElement).value = ''
}

async function saveProfile() {
  saving.value = true
  try {
    await api('/settings/profile', { method: 'PUT', body: { ...profile } })
    await api('/settings/links', { method: 'PUT', body: { links: links.value } })
    await api('/settings/tags', { method: 'PUT', body: { tags: profileTags.value } })
    await loadPublicSite()
    if (auth.user) setUser({ ...auth.user, ...profile })
    notify('个人资料已保存', 'success')
  } catch (e: any) {
    notify(e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

function addLink() {
  links.value.push({ label: '', url: '', icon: 'link' })
}
function removeLink(i: number) {
  links.value.splice(i, 1)
}

function addTag() {
  profileTags.value.push({ label: '', icon: 'star' })
}
function removeTag(i: number) {
  profileTags.value.splice(i, 1)
}

function addCategory() {
  categories.value.push('')
}
function removeCategory(i: number) {
  categories.value.splice(i, 1)
}
async function saveCategoriesList() {
  saving.value = true
  try {
    const cleaned = await saveCategories(categories.value)
    categories.value = [...cleaned]
    notify('分类已保存', 'success')
  } catch (e: any) {
    notify(e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

function onSiteIconChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) startCrop(file, 'icon')
  ;(e.target as HTMLInputElement).value = ''
}

function onBannerChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) startCrop(file, 'banner')
  ;(e.target as HTMLInputElement).value = ''
}

async function clearBanner() {
  siteForm.banner = ''
  try {
    await saveSiteSettings({ banner: '' })
    notify('已移除横幅', 'success')
  } catch (err: any) {
    notify(err.message || '操作失败', 'error')
  }
}

async function clearSiteIcon() {
  siteForm.icon = ''
  try {
    await saveSiteSettings({ icon: '' })
    applyTheme()
    notify('已恢复默认图标', 'success')
  } catch (err: any) {
    notify(err.message || '操作失败', 'error')
  }
}

async function setThemeMode(mode: 'preset' | 'dynamic') {
  siteForm.themeMode = mode
  try {
    await saveSiteSettings({ themeMode: mode })
    notify(mode === 'dynamic' ? '已启用动态取色' : '已切换为预设配色', 'success')
  } catch (err: any) {
    notify(err.message || '操作失败', 'error')
  }
}

async function setThemeSource(src: 'icon' | 'banner' | 'custom') {
  siteForm.themeSource = src
  try {
    await saveSiteSettings({ themeSource: src })
    notify('取色来源已更新', 'success')
  } catch (err: any) {
    notify(err.message || '操作失败', 'error')
  }
}

async function onSeedChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingSeed.value = true
  try {
    const res = await uploadFile(file)
    siteForm.themeSeed = res.url
    await saveSiteSettings({ themeSeed: res.url })
    notify('已从图片提取主题色', 'success')
  } catch (err: any) {
    notify(err.message || '上传失败', 'error')
  } finally {
    uploadingSeed.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

async function applySeedUrl() {
  try {
    await saveSiteSettings({ themeSeed: siteForm.themeSeed })
    notify('已更新取色图片', 'success')
  } catch (err: any) {
    notify(err.message || '操作失败', 'error')
  }
}

async function saveSite() {
  saving.value = true
  try {
    await saveSiteSettings({ ...siteForm })
    notify('站点设置已保存', 'success')
  } catch (e: any) {
    notify(e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function setAccent(id: string) {
  await saveSiteSettings({ accent: id })
  applyTheme()
  notify('主题色已更新', 'success')
}

function addGame() {
  nintendo.games.push({ name: '', playtime: '' })
}
function removeGame(i: number) {
  nintendo.games.splice(i, 1)
}

async function saveActivity() {
  saving.value = true
  try {
    await saveIntegrations({
      github: { username: github.username, token: github.token },
      steam: { steamId: steam.steamId, apiKey: steam.apiKey },
      nintendo: {
        friendCode: nintendo.friendCode,
        games: nintendo.games,
        zncaApiUrl: nintendo.zncaApiUrl,
        clientId: nintendo.clientId,
        clientSecret: nintendo.clientSecret,
      },
    })
    notify('活动集成已保存', 'success')
  } catch (e: any) {
    notify(e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function saveAccount() {
  if (account.newPassword && account.newPassword !== account.confirm) {
    return notify('两次输入的新密码不一致', 'error')
  }
  saving.value = true
  try {
    const res = await api<{ profile: any }>('/settings/account', {
      method: 'PUT',
      body: {
        username: account.username,
        currentPassword: account.currentPassword || undefined,
        newPassword: account.newPassword || undefined,
      },
    })
    if (auth.user) setUser(res.profile)
    account.currentPassword = ''
    account.newPassword = ''
    account.confirm = ''
    notify('账户已更新', 'success')
  } catch (e: any) {
    notify(e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

function exportBackup() {
  return new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/api/backup/export')
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.responseType = 'blob'
    progressShow(0)
    xhr.onprogress = (e) => {
      if (e.lengthComputable) progressShow(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const url = URL.createObjectURL(xhr.response)
        const a = document.createElement('a')
        a.href = url
        a.download = `trinity-backup-${new Date().toISOString().slice(0, 10)}.zip`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        notify('已开始下载备份文件', 'success')
      } else {
        notify(`导出失败 (${xhr.status})`, 'error')
      }
      progressFinish()
      resolve()
    }
    xhr.onerror = () => {
      notify('导出失败', 'error')
      backupProgress.active = false
      resolve()
    }
    xhr.send()
  })
}

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (
    !(await confirmDialog({
      title: '导入数据',
      message: '导入将覆盖当前站点的全部数据（设置、账户、帖子、动态与上传文件），且不可撤销。确定继续吗？',
      confirmText: '导入',
      danger: true,
    }))
  ) {
    return
  }

  importing.value = true
  importResult.value = null
  progressShow(0)

  const form = new FormData()
  form.append('file', file)

  await new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/backup/import')
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    // upload progress (determinate), then server processing (indeterminate)
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) progressShow(ev.loaded / ev.total)
    }
    xhr.upload.onload = () => progressShow(null)
    xhr.onload = async () => {
      let data: any = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        data = null
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.ok) {
        importResult.value = data.counts
        await loadPublicSite()
        notify('数据导入成功', 'success')
      } else {
        notify(data?.error || `导入失败 (${xhr.status})`, 'error')
      }
      progressFinish()
      importing.value = false
      resolve()
    }
    xhr.onerror = () => {
      notify('导入失败', 'error')
      backupProgress.active = false
      importing.value = false
      resolve()
    }
    xhr.send(form)
  })
}

async function loadInstalledPlugins() {
  try {
    const res = await api<{ plugins: InstalledPlugin[] }>('/plugins')
    installedPlugins.value = res.plugins
  } catch {
    /* ignore */
  }
}

async function onImportPlugin(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  pluginBusy.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    await api('/plugins/import', { method: 'POST', body: form, raw: true })
    await loadInstalledPlugins()
    await loadPlugins()
    notify('插件已导入，请在下方启用', 'success')
  } catch (err: any) {
    notify(err.message || '导入失败', 'error')
  } finally {
    pluginBusy.value = false
  }
}

async function updatePlugin(p: InstalledPlugin, patch: Record<string, unknown>) {
  pluginBusy.value = true
  try {
    const res = await api<{ plugin: InstalledPlugin }>(`/plugins/${p.id}`, {
      method: 'PUT',
      body: patch,
    })
    const idx = installedPlugins.value.findIndex((x) => x.id === p.id)
    if (idx !== -1) installedPlugins.value[idx] = res.plugin
    await loadPlugins()
  } catch (err: any) {
    notify(err.message || '操作失败', 'error')
  } finally {
    pluginBusy.value = false
  }
}

function togglePermission(p: InstalledPlugin, perm: string) {
  const set = new Set(p.permissions)
  set.has(perm) ? set.delete(perm) : set.add(perm)
  updatePlugin(p, { permissions: [...set] })
}

async function removePlugin(p: InstalledPlugin) {
  if (!(await confirmDialog({ title: '删除插件', message: `确定删除插件「${p.name}」吗？`, confirmText: '删除', danger: true }))) return
  try {
    await api(`/plugins/${p.id}`, { method: 'DELETE' })
    installedPlugins.value = installedPlugins.value.filter((x) => x.id !== p.id)
    await loadPlugins()
    notify('插件已删除', 'success')
  } catch (err: any) {
    notify(err.message || '删除失败', 'error')
  }
}

async function addWidgetCard(p: InstalledPlugin, widget: { id: string; title: string }) {
  try {
    await api('/cards', {
      method: 'POST',
      body: {
        type: `plugin:${p.id}:${widget.id}`,
        title: widget.title,
        width: 'half',
      },
    })
    notify(`已把「${widget.title}」添加到首页`, 'success')
  } catch (err: any) {
    notify(err.message || '添加失败', 'error')
  }
}

const PERMISSION_LABELS: Record<string, string> = {
  'posts:read': '读取帖子数据',
  'moments:read': '读取动态数据',
  'settings:read': '读取站点设置',
  'net:fetch': '发起网络请求',
  images: '访问图片资源',
  token: '使用访问令牌',
}
</script>

<template>
  <div class="settings md-container">
    <header class="settings-head">
      <span class="md-label">SETTINGS</span>
      <h1 class="md-headline">用户设置</h1>
      <p class="md-muted">在这里管理你的个人资料、站点外观、活动集成与账户安全。</p>
    </header>

    <div class="settings-layout">
      <nav class="settings-nav">
        <button
          v-for="t in TABS"
          :key="t.id"
          class="nav-item"
          :class="{ active: tab === t.id }"
          @click="tab = t.id"
        >
          <AppIcon :name="t.icon" :size="18" />{{ t.label }}
        </button>
      </nav>

      <div class="settings-panel">
        <!-- profile -->
        <section v-show="tab === 'profile'" class="card">
          <h2 class="panel-title">个人资料</h2>
          <div class="avatar-row">
            <img v-if="profile.avatar" class="avatar lg" :src="profile.avatar" alt="" />
            <span v-else class="avatar lg">{{ profile.display_name.charAt(0) || 'A' }}</span>
            <div>
              <label class="btn btn-tonal btn-sm">
                <AppIcon name="upload" :size="16" />
                上传并裁剪头像
                <input type="file" accept="image/*" hidden @change="onAvatarChange" />
              </label>
              <p class="md-muted tiny">上传后可自由拖动缩放裁剪。</p>
            </div>
          </div>

          <div class="form-grid">
            <label class="field filled">
              <input v-model="profile.display_name" class="field-input" placeholder=" " />
              <span class="field-label">显示名称</span>
            </label>
            <label class="field filled">
              <input v-model="profile.email" class="field-input" placeholder=" " />
              <span class="field-label">邮箱</span>
            </label>
          </div>
          <label class="field filled">
            <textarea v-model="profile.bio" class="field-input" placeholder=" " style="min-height: 100px" />
            <span class="field-label">个人简介</span>
          </label>

          <div class="sub-head">
            <span class="mini-label">社交链接</span>
            <button class="btn btn-outlined btn-sm" @click="addLink"><AppIcon name="add" :size="15" />添加</button>
          </div>
          <div v-for="(link, i) in links" :key="i" class="link-row">
            <input v-model="link.label" class="mini-input" placeholder="名称，如 GitHub" />
            <input v-model="link.url" class="mini-input grow" placeholder="https://" />
            <select v-model="link.icon" class="mini-input">
              <option v-for="ic in ICON_OPTIONS" :key="ic" :value="ic">{{ ic }}</option>
            </select>
            <button class="icon-btn sm" @click="removeLink(i)"><AppIcon name="close" :size="16" /></button>
          </div>

          <div class="sub-head">
            <span class="mini-label">首页标签（显示在大头像旁）</span>
            <button class="btn btn-outlined btn-sm" @click="addTag"><AppIcon name="add" :size="15" />添加</button>
          </div>
          <p class="md-muted tiny" style="margin-bottom: 10px">
            可自定义标签文字与图标，用于展示你的身份或兴趣。
          </p>
          <div v-for="(tag, i) in profileTags" :key="i" class="link-row">
            <input v-model="tag.label" class="mini-input grow" placeholder="标签文字，如 开发者" />
            <select v-model="tag.icon" class="mini-input">
              <option v-for="ic in ICON_OPTIONS" :key="ic" :value="ic">{{ ic }}</option>
            </select>
            <button class="icon-btn sm" @click="removeTag(i)"><AppIcon name="close" :size="16" /></button>
          </div>

          <div class="panel-actions">
            <button class="btn btn-filled" :disabled="saving" @click="saveProfile">
              <AppIcon name="save" :size="17" />保存资料
            </button>
          </div>
        </section>

        <!-- site -->
        <section v-show="tab === 'site'" class="card">
          <h2 class="panel-title">站点外观</h2>
          <label class="field filled">
            <input v-model="siteForm.title" class="field-input" placeholder=" " />
            <span class="field-label">站点标题</span>
          </label>
          <label class="field filled">
            <input v-model="siteForm.subtitle" class="field-input" placeholder=" " />
            <span class="field-label">欢迎标语</span>
          </label>
          <label class="field filled">
            <textarea v-model="siteForm.description" class="field-input" placeholder=" " style="min-height: 90px" />
            <span class="field-label">首页描述</span>
          </label>
          <label class="field filled">
            <input v-model="siteForm.footer" class="field-input" placeholder=" " />
            <span class="field-label">页脚文字</span>
          </label>

          <span class="mini-label">站点图标（浏览器标签页图标 / favicon）</span>
          <div class="icon-upload-row">
            <img v-if="siteForm.icon" class="site-icon-preview" :src="siteForm.icon" alt="" />
            <span v-else class="site-icon-preview placeholder"><AppIcon name="image" :size="22" /></span>
            <label class="btn btn-tonal btn-sm">
              <AppIcon name="upload" :size="15" />上传并裁剪图标
              <input type="file" accept="image/*" hidden @change="onSiteIconChange" />
            </label>
            <button v-if="siteForm.icon" class="btn btn-outlined btn-sm" @click="clearSiteIcon">
              <AppIcon name="close" :size="15" />恢复默认
            </button>
          </div>
          <p class="md-muted tiny" style="margin: 8px 0 22px">
            建议使用正方形图片，推荐 PNG/SVG，尺寸 512×512 以内。
          </p>

          <span class="mini-label">站点横幅（首页顶部背景图）</span>
          <div class="banner-preview" :style="siteForm.banner ? { backgroundImage: `url('${siteForm.banner}')` } : {}">
            <span v-if="!siteForm.banner" class="md-muted tiny">尚未设置横幅，将使用主题渐变色</span>
          </div>
          <div class="icon-upload-row" style="margin: 12px 0 22px">
            <label class="btn btn-tonal btn-sm">
              <AppIcon name="upload" :size="15" />上传并裁剪横幅
              <input type="file" accept="image/*" hidden @change="onBannerChange" />
            </label>
            <button v-if="siteForm.banner" class="btn btn-outlined btn-sm" @click="clearBanner">
              <AppIcon name="close" :size="15" />移除横幅
            </button>
          </div>

          <span class="mini-label">配色方案</span>
          <div class="segmented scheme-seg">
            <button :class="{ active: themeMode === 'preset' }" @click="setThemeMode('preset')">
              <AppIcon name="palette" :size="15" />预设配色
            </button>
            <button :class="{ active: themeMode === 'dynamic' }" @click="setThemeMode('dynamic')">
              <AppIcon name="star" :size="15" />动态取色
            </button>
          </div>

          <template v-if="themeMode === 'preset'">
            <div class="accent-row">
              <button
                v-for="a in ACCENTS"
                :key="a.id"
                class="accent-swatch"
                :class="{ active: site.site.accent === a.id || (!site.site.accent && a.id === 'violet') }"
                :style="{ background: a.color }"
                :title="a.id"
                @click="setAccent(a.id)"
              >
                <AppIcon v-if="site.site.accent === a.id || (!site.site.accent && a.id === 'violet')" name="check" :size="18" />
              </button>
            </div>
          </template>

          <template v-else>
            <p class="md-muted tiny" style="margin-bottom: 12px">
              使用 Material You 动态取色：从图片中提取种子色，自动生成整套 Material You 配色（浅色 / 深色）。
            </p>
            <div class="segmented scheme-seg">
              <button :class="{ active: themeSource === 'icon' }" @click="setThemeSource('icon')">
                <AppIcon name="image" :size="15" />站点图标
              </button>
              <button :class="{ active: themeSource === 'banner' }" @click="setThemeSource('banner')">
                <AppIcon name="image" :size="15" />站点横幅
              </button>
              <button :class="{ active: themeSource === 'custom' }" @click="setThemeSource('custom')">
                <AppIcon name="upload" :size="15" />自定义图片
              </button>
            </div>

            <template v-if="themeSource === 'custom'">
              <div class="icon-upload-row">
                <img v-if="siteForm.themeSeed" class="site-icon-preview" :src="siteForm.themeSeed" alt="" />
                <span v-else class="site-icon-preview placeholder"><AppIcon name="image" :size="22" /></span>
                <label class="btn btn-tonal btn-sm">
                  <span v-if="uploadingSeed" class="spinner" style="width: 14px; height: 14px" />
                  <AppIcon v-else name="upload" :size="15" />上传取色图片
                  <input type="file" accept="image/*" hidden @change="onSeedChange" />
                </label>
              </div>
              <label class="field filled" style="margin-top: 12px">
                <input
                  v-model="siteForm.themeSeed"
                  class="field-input"
                  placeholder=" "
                  @change="applySeedUrl"
                />
                <span class="field-label">或粘贴图片链接（例如某篇文章的封面）</span>
              </label>
            </template>
            <p v-else class="md-muted tiny" style="margin: 4px 0 0">
              当前从{{ themeSource === 'banner' ? '站点横幅' : '站点图标' }}取色。
            </p>
          </template>

          <div class="theme-row">
            <span class="mini-label" style="margin: 0">外观模式</span>
            <div class="segmented">
              <button :class="{ active: site.theme === 'light' }" @click="site.theme !== 'light' && toggleTheme()">
                <AppIcon name="light_mode" :size="15" />浅色
              </button>
              <button :class="{ active: site.theme === 'dark' }" @click="site.theme !== 'dark' && toggleTheme()">
                <AppIcon name="dark_mode" :size="15" />深色
              </button>
            </div>
          </div>

          <div class="panel-actions">
            <button class="btn btn-filled" :disabled="saving" @click="saveSite">
              <AppIcon name="save" :size="17" />保存外观
            </button>
          </div>
        </section>

        <!-- categories -->
        <section v-show="tab === 'categories'" class="card">
          <h2 class="panel-title">博客分类</h2>
          <p class="md-muted panel-hint">
            用于博客列表筛选。发布文章时可从这些分类中选择；标签仅用于搜索，不参与筛选。
          </p>

          <div class="sub-head">
            <span class="mini-label">分类列表</span>
            <button class="btn btn-outlined btn-sm" @click="addCategory">
              <AppIcon name="add" :size="15" />添加分类
            </button>
          </div>
          <div v-for="(c, i) in categories" :key="i" class="link-row">
            <input v-model="categories[i]" class="mini-input grow" placeholder="分类名称，如 随笔" />
            <button class="icon-btn sm" @click="removeCategory(i)"><AppIcon name="close" :size="16" /></button>
          </div>
          <p v-if="!categories.length" class="md-muted tiny">还没有分类，点「添加分类」创建。</p>

          <div class="panel-actions">
            <button class="btn btn-filled" :disabled="saving" @click="saveCategoriesList">
              <AppIcon name="save" :size="17" />保存分类
            </button>
          </div>
        </section>

        <!-- activity -->
        <section v-show="tab === 'activity'" class="card">
          <h2 class="panel-title">活动集成</h2>
          <p class="md-muted panel-hint">
            填写后将自动在首页「个人活动」卡片中展示。未填写时显示占位状态。
          </p>

          <div class="integration">
            <div class="integration-head">
              <span class="int-icon gh"><AppIcon name="github" :size="20" /></span>
              <h3>GitHub</h3>
            </div>
            <div class="form-grid">
              <label class="field filled">
                <input v-model="github.username" class="field-input" placeholder=" " />
                <span class="field-label">GitHub 用户名</span>
              </label>
              <label class="field filled">
                <input v-model="github.token" class="field-input" placeholder=" " />
                <span class="field-label">Personal Access Token（可选）</span>
              </label>
            </div>
          </div>

          <div class="integration">
            <div class="integration-head">
              <span class="int-icon steam"><AppIcon name="steam" :size="20" /></span>
              <h3>Steam</h3>
            </div>
            <div class="form-grid">
              <label class="field filled">
                <input v-model="steam.steamId" class="field-input" placeholder=" " />
                <span class="field-label">SteamID64</span>
              </label>
              <label class="field filled">
                <input v-model="steam.apiKey" class="field-input" placeholder=" " />
                <span class="field-label">Steam Web API Key</span>
              </label>
            </div>
          </div>

          <div class="integration">
            <div class="integration-head">
              <span class="int-icon nin"><AppIcon name="nintendo" :size="20" /></span>
              <h3>Nintendo Switch Online</h3>
              <span v-if="nintendoStatus.linked" class="badge success">已绑定</span>
            </div>

            <div v-if="nintendoStatus.loading" class="skeleton" style="height: 60px; border-radius: 16px" />

            <template v-else-if="nintendoStatus.linked">
              <div class="nso-account">
                <img
                  v-if="nintendoStatus.user?.imageUri"
                  class="avatar"
                  :src="nintendoStatus.user.imageUri"
                  alt=""
                />
                <span v-else class="avatar"><AppIcon name="nintendo" :size="22" /></span>
                <div class="nso-account-info">
                  <strong>{{ nintendoStatus.user?.name || 'Nintendo 账户' }}</strong>
                  <span v-if="nintendoStatus.user?.friendCode" class="md-muted">
                    SW-{{ nintendoStatus.user.friendCode }}
                  </span>
                  <span v-else class="md-muted">已通过 NSO 同步实时状态</span>
                </div>
                <button class="btn btn-outlined btn-sm" @click="unlinkNintendo">
                  <AppIcon name="logout" :size="15" />取消绑定
                </button>
              </div>
              <p class="md-muted panel-hint">
                已启用 NSO 实时同步，首页「个人活动」卡片会自动显示好友在线状态与正在游玩的游戏。
              </p>
            </template>

            <template v-else>
              <p class="md-muted panel-hint">
                绑定 Nintendo 账户后可实时获取好友在线状态、正在游玩的游戏与累计游玩时长。凭据仅保存在本地服务器的数据库中。
              </p>
              <ol class="nso-steps">
                <li>点击「绑定 Nintendo 账户」，在打开的任天堂登录页完成登录。</li>
                <li>登录后会跳转到一个以 <code>npf...</code> 开头的页面（浏览器可能提示无法打开，属正常）。</li>
                <li>复制地址栏中的完整链接，粘贴到下方输入框并点击「完成绑定」。</li>
              </ol>
              <div class="nso-actions">
                <button class="btn btn-tonal btn-sm" :disabled="naAuth.busy" @click="startNintendoAuth">
                  <span v-if="naAuth.busy" class="spinner" style="width: 14px; height: 14px" />
                  <AppIcon v-else name="open_in_new" :size="15" />绑定 Nintendo 账户
                </button>
                <a v-if="naAuth.url" class="btn btn-sm" :href="naAuth.url" target="_blank" rel="noopener">
                  <AppIcon name="refresh" :size="15" />重新打开登录页
                </a>
              </div>
              <div v-if="naAuth.started" class="nso-code-row">
                <input
                  v-model="naAuth.input"
                  class="mini-input grow"
                  placeholder="粘贴 npf...://auth#session_token_code=... 链接"
                />
                <button class="btn btn-filled btn-sm" :disabled="naAuth.busy" @click="confirmNintendoAuth">
                  <AppIcon name="check" :size="15" />完成绑定
                </button>
              </div>
            </template>

            <div class="divider" />
            <div class="sub-head">
              <span class="mini-label">手动记录（未绑定时的备用展示）</span>
              <button class="btn btn-outlined btn-sm" @click="addGame">
                <AppIcon name="add" :size="15" />添加
              </button>
            </div>
            <label class="field filled">
              <input v-model="nintendo.friendCode" class="field-input" placeholder=" " />
              <span class="field-label">好友代码（SW-xxxx-xxxx-xxxx）</span>
            </label>
            <div v-for="(g, i) in nintendo.games" :key="i" class="link-row">
              <input v-model="g.name" class="mini-input grow" placeholder="游戏名称" />
              <input v-model="g.playtime" class="mini-input" placeholder="时长，如 20 小时" />
              <button class="icon-btn sm" @click="removeGame(i)"><AppIcon name="close" :size="16" /></button>
            </div>

            <div class="divider" />
            <div class="sub-head">
              <span class="mini-label">开发者凭据（nxapi znca 代理）</span>
              <a class="btn btn-outlined btn-sm" :href="NSO_DOC_URL" target="_blank" rel="noopener">
                <AppIcon name="open_in_new" :size="15" />如何获取？
              </a>
            </div>
            <p class="md-muted tiny" style="margin: 0 0 12px">
              实时读取 NSO 数据需要 nxapi 代理的客户端凭据。填写后首页活动卡与「Switch 游戏库」才能获取数据。
            </p>
            <label class="field filled">
              <input v-model="nintendo.zncaApiUrl" class="field-input" placeholder=" " />
              <span class="field-label">znca 代理地址</span>
            </label>
            <div class="form-grid">
              <label class="field filled">
                <input v-model="nintendo.clientId" class="field-input" placeholder=" " />
                <span class="field-label">nxapi Client ID</span>
              </label>
              <label class="field filled">
                <input v-model="nintendo.clientSecret" type="password" class="field-input" placeholder=" " />
                <span class="field-label">nxapi Client Secret（可选）</span>
              </label>
            </div>
          </div>

          <div class="panel-actions">
            <button class="btn btn-filled" :disabled="saving" @click="saveActivity">
              <AppIcon name="save" :size="17" />保存集成
            </button>
          </div>
        </section>

        <!-- plugins -->
        <section v-show="tab === 'plugins'" class="card">
          <h2 class="panel-title">拓展程序</h2>
          <p class="md-muted panel-hint">
            导入 ZIP 插件包（含 <code>plugin.json</code>、<code>app.js</code>，可选
            <code>ui.ux</code> 与 <code>sources/</code>）。可启用/禁用、管理权限，并决定是否对访客开放。
          </p>

          <div class="plugin-import">
            <label class="btn btn-filled">
              <span v-if="pluginBusy" class="spinner" style="width: 15px; height: 15px" />
              <AppIcon v-else name="upload" :size="17" />导入插件包（.zip）
              <input type="file" accept=".zip,application/zip" hidden @change="onImportPlugin" />
            </label>
          </div>

          <div v-if="!installedPlugins.length" class="md-muted tiny" style="margin-top: 16px">
            还没有安装任何插件。
          </div>

          <div v-for="p in installedPlugins" :key="p.id" class="plugin-card">
            <div class="plugin-card-head">
              <div>
                <div class="plugin-name">
                  {{ p.name }}
                  <span class="md-muted">v{{ p.version }}</span>
                  <span v-if="p.error" class="badge hidden-badge">加载失败</span>
                  <span v-else-if="p.enabled" class="badge success">已启用</span>
                </div>
                <p class="md-muted tiny">
                  {{ p.description || '（无描述）' }}
                  <template v-if="p.author"> · {{ p.author }}</template>
                </p>
                <p v-if="p.error" class="plugin-error">{{ p.error }}</p>
              </div>
              <button class="icon-btn danger" title="删除" @click="removePlugin(p)">
                <AppIcon name="delete" :size="18" />
              </button>
            </div>

            <div class="plugin-toggles">
              <label class="switch">
                <input type="checkbox" :checked="p.enabled" @change="updatePlugin(p, { enabled: !p.enabled })" />
                <span class="switch-track"><span class="switch-thumb" /></span>
                <span>启用</span>
              </label>
              <label class="switch">
                <input type="checkbox" :checked="p.visitor" @change="updatePlugin(p, { visitor: !p.visitor })" />
                <span class="switch-track"><span class="switch-thumb" /></span>
                <span>对访客开放</span>
              </label>
            </div>

            <div v-if="p.requestedPermissions.length" class="plugin-perms">
              <span class="mini-label">权限</span>
              <label v-for="perm in p.requestedPermissions" :key="perm" class="perm-item">
                <input type="checkbox" :checked="p.permissions.includes(perm)" @change="togglePermission(p, perm)" />
                <span>{{ PERMISSION_LABELS[perm] || perm }}</span>
              </label>
              <label v-if="p.requestedPermissions.includes('token')" class="field filled" style="margin-top: 8px">
                <input v-model="p.token" class="field-input" placeholder=" " @change="updatePlugin(p, { token: p.token })" />
                <span class="field-label">访问令牌</span>
              </label>
            </div>

            <div
              v-if="p.loaded && (p.widgets.length || p.pages.length || p.postModules.length || p.overlays.length)"
              class="plugin-contrib"
            >
              <span class="mini-label">提供的内容</span>
              <div v-if="p.widgets.length" class="contrib-row">
                <span class="contrib-label">小组件</span>
                <button
                  v-for="w in p.widgets"
                  :key="w.id"
                  class="btn btn-tonal btn-sm"
                  @click="addWidgetCard(p, w)"
                >
                  <AppIcon name="add" :size="15" />{{ w.title }}
                </button>
              </div>
              <div v-if="p.pages.length" class="contrib-row">
                <span class="contrib-label">页面</span>
                <router-link
                  v-for="pg in p.pages"
                  :key="pg.id"
                  :to="`/p/${p.id}/${pg.id}`"
                  class="chip"
                >
                  {{ pg.title }}
                </router-link>
              </div>
              <div v-if="p.overlays.length" class="contrib-row">
                <span class="contrib-label">叠加层</span>
                <span v-for="o in p.overlays" :key="o.id" class="chip static">
                  叠加层 · {{ o.id }}
                </span>
              </div>
              <div v-if="p.postModules.length" class="contrib-row">
                <span class="contrib-label">帖子模块</span>
                <code v-for="m in p.postModules" :key="m.id">[[plugin:{{ p.id }}/{{ m.id }}]]</code>
              </div>
            </div>
          </div>
        </section>

        <!-- account -->
        <section v-show="tab === 'account'" class="card">
          <h2 class="panel-title">账户安全</h2>
          <label class="field filled">
            <input v-model="account.username" class="field-input" placeholder=" " autocomplete="username" />
            <span class="field-label">用户名</span>
          </label>

          <div class="divider" />
          <span class="mini-label">修改密码（不修改可留空）</span>
          <label class="field filled">
            <input v-model="account.currentPassword" type="password" class="field-input" placeholder=" " autocomplete="current-password" />
            <span class="field-label">当前密码</span>
          </label>
          <div class="form-grid">
            <label class="field filled">
              <input v-model="account.newPassword" type="password" class="field-input" placeholder=" " autocomplete="new-password" />
              <span class="field-label">新密码</span>
            </label>
            <label class="field filled">
              <input v-model="account.confirm" type="password" class="field-input" placeholder=" " autocomplete="new-password" />
              <span class="field-label">确认新密码</span>
            </label>
          </div>

          <div class="panel-actions">
            <button class="btn btn-filled" :disabled="saving" @click="saveAccount">
              <AppIcon name="lock" :size="17" />更新账户
            </button>
          </div>
        </section>

        <!-- backup -->
        <section v-show="tab === 'backup'" class="card">
          <h2 class="panel-title">备份与迁移</h2>
          <p class="md-muted panel-hint">
            将整个站点的数据导出为一个 ZIP 文件，在另一个使用相同软件的站点导入即可完成迁移。
          </p>

          <div
            class="backup-progress"
            :class="{ show: backupProgress.active, indeterminate: backupProgress.value === null }"
          >
            <div
              class="backup-progress-fill"
              :style="{ width: backupProgress.value !== null ? `${Math.max(4, Math.round(backupProgress.value * 100))}%` : '' }"
            />
          </div>

          <div class="backup-block">
            <h3><AppIcon name="save" :size="18" />导出数据</h3>
            <p class="md-muted tiny">
              包含：站点设置、用户账户（含密码哈希）、帖子、动态、首页卡片，以及全部上传文件。
            </p>
            <button class="btn btn-filled" :disabled="backupProgress.active" @click="exportBackup">
              <AppIcon name="upload" :size="17" />导出为 ZIP
            </button>
          </div>

          <div class="divider" />

          <div class="backup-block">
            <h3><AppIcon name="history" :size="18" />导入数据</h3>
            <p class="md-muted tiny danger-text">
              导入会<strong>覆盖</strong>当前站点的全部数据（设置、账户、帖子、动态与上传文件），且不可撤销。请先导出备份。
            </p>
            <label class="btn btn-danger">
              <span v-if="importing" class="spinner" style="width: 15px; height: 15px" />
              <AppIcon v-else name="upload" :size="17" />
              {{ importing ? '导入中…' : '选择备份文件导入' }}
              <input type="file" accept=".zip,application/zip" hidden @change="onImportFile" />
            </label>
            <div v-if="importResult" class="import-result">
              已导入 · 用户 {{ importResult.users }} · 帖子 {{ importResult.posts }} · 动态
              {{ importResult.moments }} · 卡片 {{ importResult.cards }} · 文件 {{ importResult.files }}
            </div>
          </div>
        </section>
      </div>
    </div>

    <ImageCropper
      :open="crop.open"
      :src="crop.src"
      :aspect-ratio="crop.aspect"
      :output-width="crop.width"
      :output-height="crop.height"
      :round="crop.round"
      :title="crop.title"
      @close="closeCrop"
      @done="onCropDone"
    />
  </div>
</template>

<style scoped>
.settings {
  padding: var(--section-space, 40px) 0 clamp(48px, 10vw, 96px);
}
.settings-head h1 {
  margin: 2px 0 6px;
}
.settings-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 28px;
  margin-top: 28px;
  align-items: start;
}
.settings-panel {
  min-width: 0;
}
.settings-panel .card {
  min-width: 0;
  overflow-wrap: anywhere;
}
.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: sticky;
  top: 88px;
  min-width: 0;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 18px;
  border: none;
  border-radius: var(--md-shape-full);
  background: transparent;
  color: var(--md-on-surface-variant);
  font-weight: 600;
  font-size: 0.92rem;
  cursor: pointer;
  text-align: left;
  transition: background-color var(--md-dur-short) var(--md-ease-standard);
}
.nav-item:hover {
  background: color-mix(in srgb, var(--md-on-surface) 7%, transparent);
}
.nav-item.active {
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}
.settings-panel .card {
  padding: 28px;
}
.panel-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 20px;
  letter-spacing: -0.01em;
}
.panel-hint {
  font-size: 0.86rem;
  margin: -8px 0 18px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.avatar-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
}
.avatar-row label {
  cursor: pointer;
}
.icon-upload-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.icon-upload-row label {
  cursor: pointer;
}
.site-icon-preview {
  width: 56px;
  height: 56px;
  border-radius: var(--md-shape-md);
  object-fit: cover;
  background: var(--md-surface-container-high);
  flex: none;
}
.site-icon-preview.placeholder {
  display: grid;
  place-items: center;
  color: var(--md-on-surface-variant);
}
.banner-preview {
  width: 100%;
  height: 130px;
  border-radius: var(--md-shape-lg);
  background: linear-gradient(135deg, var(--md-primary-container), var(--md-tertiary-container)) center/cover no-repeat;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--md-outline-variant);
}
.tiny {
  font-size: 0.76rem;
  margin-top: 8px;
}
.sub-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0 12px;
}
.sub-head .mini-label {
  margin-bottom: 0;
}
.mini-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--md-on-surface-variant);
  margin-bottom: 10px;
}
.link-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.mini-input {
  height: 44px;
  padding: 0 12px;
  border: 1px solid var(--md-outline);
  border-radius: var(--md-shape-sm);
  background: transparent;
  min-width: 0;
}
.mini-input.grow {
  flex: 1;
}
.panel-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--md-outline-variant);
}
.backup-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}
.backup-progress {
  height: 4px;
  border-radius: var(--md-shape-full);
  background: var(--md-surface-container-highest);
  overflow: hidden;
  margin: 4px 0 16px;
  opacity: 0;
  transition: opacity var(--md-dur-short) var(--md-ease-standard);
}
.backup-progress.show {
  opacity: 1;
}
.backup-progress-fill {
  height: 100%;
  width: 0;
  border-radius: var(--md-shape-full);
  background: var(--md-primary);
  transition: width 0.2s var(--md-ease-standard);
}
.backup-progress.indeterminate .backup-progress-fill {
  width: 40%;
  animation: backup-indet 1.1s var(--md-ease-standard) infinite;
}
@keyframes backup-indet {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(320%); }
}
.backup-block h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: 700;
}
.backup-block .tiny {
  font-size: 0.8rem;
  max-width: 60ch;
}
.danger-text strong {
  color: var(--md-error);
}
.import-result {
  margin-top: 6px;
  padding: 10px 14px;
  border-radius: var(--md-shape-md);
  background: var(--md-success-container);
  color: var(--md-on-success-container);
  font-size: 0.82rem;
}
.plugin-import {
  margin: 8px 0 4px;
}
.plugin-import label {
  cursor: pointer;
}
.plugin-card {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-xl);
}
.plugin-card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.plugin-name {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-weight: 700;
}
.plugin-name .md-muted {
  font-weight: 400;
  font-size: 0.8rem;
}
.plugin-error {
  color: var(--md-error);
  font-size: 0.8rem;
  margin-top: 4px;
}
.plugin-toggles {
  display: flex;
  gap: 22px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.plugin-perms {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--md-outline-variant);
}
.plugin-contrib {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--md-outline-variant);
}
.contrib-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.contrib-label {
  font-size: 0.78rem;
  color: var(--md-on-surface-variant);
  min-width: 60px;
}
.contrib-row code {
  font-family: var(--md-font-mono);
  font-size: 0.72rem;
  background: var(--md-surface-container-high);
  padding: 3px 8px;
  border-radius: var(--md-shape-xs);
}
.contrib-row .chip:hover {
  text-decoration: none;
}
.perm-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 16px 8px 0;
  font-size: 0.84rem;
  cursor: pointer;
}
.perm-item input {
  accent-color: var(--md-primary);
}
.icon-btn.danger {
  color: var(--md-error);
}
.accent-row {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.scheme-seg {
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.scheme-seg button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.accent-swatch {
  width: 44px;
  height: 44px;
  border-radius: var(--md-shape-full);
  border: 3px solid transparent;
  display: grid;
  place-items: center;
  color: #fff;
  cursor: pointer;
  transition: transform var(--md-dur-short) var(--md-ease-expressive),
    box-shadow var(--md-dur-short) var(--md-ease-standard);
}
.accent-swatch:hover {
  transform: scale(1.08);
}
.accent-swatch.active {
  box-shadow: 0 0 0 3px var(--md-surface), 0 0 0 5px currentColor;
}
.theme-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}
.integration {
  padding: 20px;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-xl);
  margin-bottom: 18px;
}
.integration-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.integration-head h3 {
  font-size: 1.05rem;
  font-weight: 700;
}
.int-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--md-shape-md);
  background: var(--md-surface-container-highest);
}
.int-icon.gh { color: #24292f; background: #f0f0f0; }
.int-icon.steam { color: #fff; background: #1b2838; }
.int-icon.nin { color: #fff; background: #e60012; }
.nso-account {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: var(--md-shape-lg);
  background: var(--md-surface-container-high);
}
.nso-account-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.nso-account-info span {
  font-size: 0.78rem;
}
.nso-steps {
  margin: 0 0 16px;
  padding-left: 1.2em;
  color: var(--md-on-surface-variant);
  font-size: 0.86rem;
  line-height: 1.7;
}
.nso-steps code {
  font-family: var(--md-font-mono);
  background: var(--md-surface-container-highest);
  padding: 1px 5px;
  border-radius: var(--md-shape-xs);
}
.nso-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.nso-code-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
@media (max-width: 820px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }
  .settings-nav {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .nav-item {
    flex: none;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
