<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import ImageCropper from '@/components/ImageCropper.vue'
import BaseDialog from '@/components/BaseDialog.vue'
import PluginView from '@/components/PluginView.vue'
import { api, uploadFile } from '@/lib/api'
import { auth, setUser } from '@/stores/auth'
import {
  loadFullSettings,
  loadPublicSite,
  saveCategories,
  saveHomepage,
  saveIntegrations,
  saveSiteSettings,
  site,
  toggleTheme,
  applyTheme,
} from '@/stores/site'
import { notify } from '@/stores/toast'
import { confirmDialog } from '@/stores/dialog'
import { loadPlugins, plugins } from '@/lib/plugins'
import type { InstalledPlugin, LinkItem, ProfileTag } from '@/lib/types'

const route = useRoute()
const tab = ref<string>((route.query.tab as string) || 'profile')
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
// admins may manage another user's plugins via ?username=
const pluginOwner = ref('')
const pluginUsers = ref<{ id: number; username: string; display_name: string }[]>([])
function pluginQuery() {
  return pluginOwner.value ? `?username=${encodeURIComponent(pluginOwner.value)}` : ''
}
// pre-install confirmation dialog
interface ImportPreview {
  file: File
  id: string
  name: string
  version: string
  description: string
  author: string
  permissions: string[]
  minSdkVersion: string
  sdkVersion: string
  sdkOk: boolean
  update: boolean
  existingVersion: string | null
}
const importPreview = ref<ImportPreview | null>(null)
const importState = reactive<{ busy: boolean; progress: number | null }>({ busy: false, progress: null })
// plugin management dialog
const manageId = ref<string | null>(null)
const managedPlugin = computed<InstalledPlugin | null>(
  () => installedPlugins.value.find((p) => p.id === manageId.value) || null
)
function openManage(p: InstalledPlugin) {
  manageId.value = p.id
}
function closeManage() {
  manageId.value = null
}

const profile = reactive({ display_name: '', email: '', avatar: '', bio: '' })
const homeBanner = reactive({ banner: '', subtitle: '', description: '' })
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
  target: '' as '' | 'avatar' | 'icon' | 'banner' | 'user-banner',
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
  provider: 'auto' as 'auto' | 'imink' | 'flapg',
  remoteConfig: false,
  configUrl: '',
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

const isAdminUser = computed(() => auth.user?.role === 'admin')
const ALL_TABS = [
  { id: 'profile', label: '个人资料', icon: 'person', adminOnly: false },
  { id: 'site', label: '站点外观', icon: 'palette', adminOnly: true },
  { id: 'categories', label: '博客分类', icon: 'article', adminOnly: false },
  { id: 'activity', label: '活动集成', icon: 'history', adminOnly: false },
  { id: 'plugins', label: '拓展程序', icon: 'extension', adminOnly: false },
  { id: 'users', label: '用户管理', icon: 'group', adminOnly: true },
  { id: 'account', label: '账户安全', icon: 'lock', adminOnly: false },
  { id: 'storage', label: '存储空间', icon: 'storage', adminOnly: false },
  { id: 'backup', label: '备份与迁移', icon: 'save', adminOnly: true },
] as const
const canManagePlugins = computed(() => isAdminUser.value || Boolean(auth.user?.permissions?.plugins))
// settings panels contributed by enabled plugins (available to the current user)
const pluginSettings = computed(() =>
  plugins.list.flatMap((p) =>
    (p.settings || [])
      .filter((s) => !s.adminOnly || isAdminUser.value)
      .map((s) => ({ plugin: p, setting: s }))
  )
)
const TABS = computed(() => [
  ...ALL_TABS.filter((t) => {
    if (t.id === 'plugins') return canManagePlugins.value
    return isAdminUser.value || !t.adminOnly
  }),
  ...pluginSettings.value.map(({ plugin, setting }) => ({
    id: `plugin:${plugin.id}:${setting.id}`,
    label: setting.title,
    icon: setting.icon || 'settings',
  })),
])
// if the active tab isn't available to this user, fall back to the first one
watch(TABS, (tabs) => {
  if (!tabs.some((t) => t.id === tab.value)) tab.value = tabs[0]?.id || 'profile'
})

async function load() {
  const data = await loadFullSettings()
  const p = data.profile
  profile.display_name = p.display_name || ''
  profile.email = p.email || ''
  profile.avatar = p.avatar || ''
  profile.bio = p.bio || ''
  Object.assign(homeBanner, {
    banner: data.homepage?.banner || '',
    subtitle: data.homepage?.subtitle || '',
    description: data.homepage?.description || '',
  })
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
  const ns = (data as any).nintendoServer || {}
  nintendo.zncaApiUrl = ns.zncaApiUrl || 'https://nxapi-znca-api.fancy.org.uk/api/znca'
  nintendo.clientId = ns.clientId || ''
  nintendo.clientSecret = ns.clientSecret || ''
  nintendo.provider = ns.provider || 'auto'
  nintendo.remoteConfig = ns.remoteConfig === true
  nintendo.configUrl = ns.configUrl || ''
  account.username = p.username || ''
}

onMounted(() => {
  load()
  loadNintendoStatus()
  loadInstalledPlugins()
  loadPluginUsers()
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

/* ---------------- storage ---------------- */

interface StorageCategory {
  bytes: number
  files?: number
  detail?: Record<string, number>
}
interface StorageUser {
  id: number
  username: string
  name: string
  role: string
  bytes: number
}
interface StorageOverview {
  disk: { total: number; used: number; free: number }
  site: { bytes: number; parts: { id: string; label: string; bytes: number }[] }
  uploads: { total: number; referenced: number; orphan: number; orphanCount: number }
  limited: boolean
  own?: { id: number; name: string; bytes: number }
  others?: number
  users: StorageUser[]
  categories: {
    posts: StorageCategory
    moments: StorageCategory
    system: StorageCategory
    plugins: { id: string; name: string; owner?: string; enabled: boolean; bytes: number; files: number }[]
  } | null
}

const storage = ref<StorageOverview | null>(null)
const storageLoading = ref(false)

function fmtBytes(bytes: number): string {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = n / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`
}
function storagePct(part: number, total: number): number {
  return total ? Math.min(100, (part / total) * 100) : 0
}

async function loadStorage() {
  storageLoading.value = true
  try {
    storage.value = await api<StorageOverview>('/settings/storage')
  } catch (e: any) {
    notify(e.message || '读取存储信息失败', 'error')
  } finally {
    storageLoading.value = false
  }
}

async function cleanOrphans() {
  const ok = await confirmDialog({
    title: '清理孤立文件',
    message: '删除未被任何帖子 / 动态 / 站点素材引用的上传文件？该操作不可撤销。',
    confirmText: '清理',
    danger: true,
  })
  if (!ok) return
  try {
    const r = await api<{ removed: number; bytes: number; storage: StorageOverview }>(
      '/settings/storage/clean-orphans',
      { method: 'POST' }
    )
    storage.value = r.storage
    notify(`已清理 ${r.removed} 个文件，释放 ${fmtBytes(r.bytes)}`, 'success')
  } catch (e: any) {
    notify(e.message || '清理失败', 'error')
  }
}

async function vacuumDb() {
  const ok = await confirmDialog({
    title: '整理数据库',
    message: '对数据库执行 VACUUM 以回收空间？大站可能耗时较久。',
    confirmText: '整理',
  })
  if (!ok) return
  try {
    const r = await api<{ before: number; after: number; storage: StorageOverview }>(
      '/settings/storage/vacuum',
      { method: 'POST' }
    )
    storage.value = r.storage
    notify(`数据库已整理，回收 ${fmtBytes(Math.max(0, r.before - r.after))}`, 'success')
  } catch (e: any) {
    notify(e.message || '整理失败', 'error')
  }
}

async function clearPluginStorage(owner: string, id: string, name: string) {
  const ok = await confirmDialog({
    title: '清空插件存储',
    message: `删除插件「${name}」的全部存储文件？其上传的内容将丢失。`,
    confirmText: '清空',
    danger: true,
  })
  if (!ok) return
  try {
    const r = await api<{ removed: number; bytes: number; storage: StorageOverview }>(
      `/settings/storage/plugin/${encodeURIComponent(id)}/clear?username=${encodeURIComponent(owner)}`,
      { method: 'POST' }
    )
    storage.value = r.storage
    notify(`已清空「${name}」，释放 ${fmtBytes(r.bytes)}`, 'success')
  } catch (e: any) {
    notify(e.message || '清空失败', 'error')
  }
}

watch(
  tab,
  (t) => {
    if (t === 'storage' && !storage.value) loadStorage()
    if (t === 'users' && !users.value.length) loadUsers()
  },
  { immediate: true }
)

/* ---------------- user management (admin) ---------------- */

interface ManageUser {
  id: number
  username: string
  display_name: string
  email: string
  bio: string
  role: 'admin' | 'user'
  permissions: { post?: boolean; moment?: boolean; plugins?: boolean }
  pluginPermissions: string[]
  posts: number
  moments: number
}

const users = ref<ManageUser[]>([])
const usersLoading = ref(false)
const userSaving = ref(false)
const addUserOpen = ref(false)
const newUser = reactive({
  username: '',
  password: '',
  displayName: '',
  role: 'user' as 'admin' | 'user',
  post: true,
  moment: true,
  plugins: false,
})
const postsDialog = reactive<{ open: boolean; user: ManageUser | null; posts: any[]; loading: boolean }>({
  open: false,
  user: null,
  posts: [],
  loading: false,
})

async function loadUsers() {
  usersLoading.value = true
  try {
    const res = await api<{ users: ManageUser[] }>('/users')
    users.value = res.users
  } catch (e: any) {
    notify(e.message || '加载用户失败', 'error')
  } finally {
    usersLoading.value = false
  }
}

async function createUser() {
  if (userSaving.value) return
  userSaving.value = true
  try {
    await api('/users', {
      method: 'POST',
      body: {
        username: newUser.username,
        password: newUser.password,
        displayName: newUser.displayName,
        role: newUser.role,
        permissions: { post: newUser.post, moment: newUser.moment, plugins: newUser.plugins },
      },
    })
    notify('用户已创建', 'success')
    addUserOpen.value = false
    Object.assign(newUser, {
      username: '',
      password: '',
      displayName: '',
      role: 'user',
      post: true,
      moment: true,
      plugins: false,
    })
    await loadUsers()
  } catch (e: any) {
    notify(e.message || '创建失败', 'error')
  } finally {
    userSaving.value = false
  }
}

const KNOWN_PLUGIN_PERMS = [
  { id: 'storage', label: '读写插件存储' },
  { id: 'net:fetch', label: '发起网络请求' },
  { id: 'token', label: '使用访问令牌' },
  { id: 'posts:read', label: '读取帖子数据' },
  { id: 'moments:read', label: '读取动态数据' },
  { id: 'settings:read', label: '读取站点设置' },
]
const pluginPermDialog = reactive<{ open: boolean; user: ManageUser | null; perms: string[] }>({
  open: false,
  user: null,
  perms: [],
})

function openPluginPerms(u: ManageUser) {
  pluginPermDialog.user = u
  pluginPermDialog.perms = Array.isArray(u.pluginPermissions) ? [...u.pluginPermissions] : []
  pluginPermDialog.open = true
}

function togglePluginPerm(id: string) {
  const set = new Set(pluginPermDialog.perms)
  set.has(id) ? set.delete(id) : set.add(id)
  pluginPermDialog.perms = [...set]
}

async function savePluginPerms() {
  const u = pluginPermDialog.user
  if (!u) return
  await updateUser(u, { pluginPermissions: pluginPermDialog.perms })
  pluginPermDialog.open = false
}

async function updateUser(u: ManageUser, patch: Record<string, unknown>) {
  try {
    const res = await api<{ user: ManageUser }>(`/users/${u.id}`, { method: 'PUT', body: patch })
    const idx = users.value.findIndex((x) => x.id === u.id)
    if (idx !== -1) users.value[idx] = res.user
    notify('已保存', 'success')
  } catch (e: any) {
    notify(e.message || '保存失败', 'error')
  }
}

function toggleUserPermission(u: ManageUser, cap: 'post' | 'moment' | 'plugins') {
  return updateUser(u, { permissions: { ...u.permissions, [cap]: !u.permissions?.[cap] } })
}

function setUserRole(u: ManageUser, role: 'admin' | 'user') {
  return updateUser(u, { role })
}

async function deleteUser(u: ManageUser) {
  const ok = await confirmDialog({
    title: '删除用户',
    message: `删除用户「${u.display_name || u.username}」？其卡片与个人设置会一并删除，帖子/动态将失去作者归属。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  try {
    await api(`/users/${u.id}`, { method: 'DELETE' })
    notify('用户已删除', 'success')
    users.value = users.value.filter((x) => x.id !== u.id)
  } catch (e: any) {
    notify(e.message || '删除失败', 'error')
  }
}

async function openUserPosts(u: ManageUser) {
  postsDialog.user = u
  postsDialog.open = true
  postsDialog.posts = []
  postsDialog.loading = true
  try {
    const res = await api<{ posts: any[] }>(`/posts?author_id=${u.id}&all=1&limit=200`)
    postsDialog.posts = res.posts
  } catch (e: any) {
    notify(e.message || '加载帖子失败', 'error')
  } finally {
    postsDialog.loading = false
  }
}

async function deleteUserPost(p: any) {
  const ok = await confirmDialog({ title: '删除帖子', message: `删除「${p.title}」？`, confirmText: '删除', danger: true })
  if (!ok) return
  try {
    await api(`/posts/${p.id}`, { method: 'DELETE' })
    postsDialog.posts = postsDialog.posts.filter((x) => x.id !== p.id)
    notify('帖子已删除', 'success')
  } catch (e: any) {
    notify(e.message || '删除失败', 'error')
  }
}

async function toggleUserPostStatus(p: any) {
  const next = p.status === 'published' ? 'hidden' : 'published'
  try {
    await api(`/posts/${p.id}/status`, { method: 'PATCH', body: { status: next } })
    p.status = next
  } catch (e: any) {
    notify(e.message || '操作失败', 'error')
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

function startCrop(file: File, target: 'avatar' | 'icon' | 'banner' | 'user-banner') {
  const cfg = {
    avatar: { aspect: 1, width: 512, height: 512, round: true, title: '裁剪头像' },
    icon: { aspect: 1, width: 512, height: 512, round: false, title: '裁剪站点图标' },
    banner: { aspect: 16 / 7, width: 1920, height: 840, round: false, title: '裁剪站点横幅' },
    'user-banner': { aspect: 16 / 7, width: 1920, height: 840, round: false, title: '裁剪主页横幅' },
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
    } else if (target === 'user-banner') {
      homeBanner.banner = res.url
      await saveHomepage({ banner: res.url })
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
    await saveHomepage({
      banner: homeBanner.banner,
      subtitle: homeBanner.subtitle,
      description: homeBanner.description,
    })
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

function onUserBannerChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) startCrop(file, 'user-banner')
  ;(e.target as HTMLInputElement).value = ''
}

async function clearUserBanner() {
  homeBanner.banner = ''
  try {
    await saveHomepage({ banner: '' })
    notify('已移除主页横幅', 'success')
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
        provider: nintendo.provider,
        remoteConfig: nintendo.remoteConfig,
        configUrl: nintendo.configUrl,
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
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
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
  if (!canManagePlugins.value) return
  try {
    const res = await api<{ plugins: InstalledPlugin[] }>(`/plugins/manage${pluginQuery()}`)
    installedPlugins.value = res.plugins
  } catch {
    /* ignore */
  }
}

async function loadPluginUsers() {
  if (!isAdminUser.value) return
  try {
    const res = await api<{ users: { id: number; username: string; display_name: string }[] }>('/users')
    pluginUsers.value = res.users
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
    const { plugin } = await api<{ plugin: Omit<ImportPreview, 'file'> }>('/plugins/inspect', {
      method: 'POST',
      body: form,
      raw: true,
    })
    importPreview.value = { file, ...plugin }
  } catch (err: any) {
    notify(err.message || '无法解析插件包', 'error')
  } finally {
    pluginBusy.value = false
  }
}

function closeImportPreview() {
  if (importState.busy) return
  importPreview.value = null
}

function uploadPluginZip(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/plugins/import${pluginQuery()}`)
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && importState.progress !== null) importState.progress = ev.loaded / ev.total
    }
    xhr.upload.onload = () => {
      // upload done; server is now extracting (indeterminate)
      importState.progress = null
    }
    xhr.onload = () => {
      let data: any = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        data = null
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(data?.error || `安装失败 (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('网络错误'))
    xhr.send(form)
  })
}

async function confirmImportPlugin() {
  const p = importPreview.value
  if (!p) return
  importState.busy = true
  importState.progress = 0
  try {
    await uploadPluginZip(p.file)
    importPreview.value = null
    await loadInstalledPlugins()
    await loadPlugins()
    notify(
      p.update ? `插件「${p.name}」已更新至 v${p.version}` : `插件「${p.name}」已安装，请在下方启用`,
      'success'
    )
  } catch (err: any) {
    notify(err.message || '安装失败', 'error')
  } finally {
    importState.busy = false
    importState.progress = null
  }
}

async function updatePlugin(p: InstalledPlugin, patch: Record<string, unknown>) {
  pluginBusy.value = true
  try {
    const res = await api<{ plugin: InstalledPlugin }>(`/plugins/${p.id}${pluginQuery()}`, {
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

function canGrantPerm(perm: string) {
  if (isAdminUser.value) return true
  return Array.isArray(auth.user?.pluginPermissions) && auth.user!.pluginPermissions.includes(perm)
}

function togglePermission(p: InstalledPlugin, perm: string) {
  const set = new Set(p.permissions)
  set.has(perm) ? set.delete(perm) : set.add(perm)
  updatePlugin(p, { permissions: [...set] })
}

async function removePlugin(p: InstalledPlugin) {
  if (!(await confirmDialog({ title: '删除插件', message: `确定删除插件「${p.name}」吗？`, confirmText: '删除', danger: true }))) return
  try {
    await api(`/plugins/${p.id}${pluginQuery()}`, { method: 'DELETE' })
    installedPlugins.value = installedPlugins.value.filter((x) => x.id !== p.id)
    if (manageId.value === p.id) manageId.value = null
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
  storage: '读写插件存储',
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
            <span class="mini-label">主页横幅</span>
          </div>
          <p class="md-muted tiny" style="margin-bottom: 10px">
            仅作用于你在 <code>/user/{{ account.username }}</code> 的个人主页；留空时回退到站点横幅。
          </p>
          <div
            class="banner-preview"
            :style="homeBanner.banner ? { backgroundImage: `url('${homeBanner.banner}')` } : {}"
          >
            <span v-if="!homeBanner.banner" class="md-muted tiny">未设置，使用站点横幅或主题渐变</span>
          </div>
          <div class="icon-upload-row" style="margin: 12px 0 16px">
            <label class="btn btn-tonal btn-sm">
              <AppIcon name="upload" :size="15" />上传并裁剪横幅
              <input type="file" accept="image/*" hidden @change="onUserBannerChange" />
            </label>
            <button v-if="homeBanner.banner" class="btn btn-outlined btn-sm" @click="clearUserBanner">
              <AppIcon name="close" :size="15" />移除横幅
            </button>
          </div>
          <label class="field filled">
            <input v-model="homeBanner.subtitle" class="field-input" placeholder=" " />
            <span class="field-label">横幅欢迎语（可选）</span>
          </label>
          <label class="field filled">
            <textarea
              v-model="homeBanner.description"
              class="field-input"
              placeholder=" "
              style="min-height: 70px"
            />
            <span class="field-label">横幅描述（可选）</span>
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
            <span class="mini-label">标签</span>
            <button class="btn btn-outlined btn-sm" @click="addTag"><AppIcon name="add" :size="15" />添加</button>
          </div>
          <p class="md-muted tiny" style="margin-bottom: 10px">
            自定义标签文字与图标，展示你的身份或兴趣。
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
              使用 Material You 动态取色
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
                <span class="field-label">或粘贴图片链接</span>
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
            你自己博客的帖子分类，用于你自己的博客页面与分类筛选（每个用户独立）。
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
          <p v-if="!categories.length" class="md-muted tiny">还没有分类，请点击“添加分类“创建。</p>

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
            填写后将自动在首页“个人活动“卡片中展示。未填写时显示占位状态。
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
                绑定 Nintendo 账户后可实时获取好友在线状态、正在游玩的游戏与累计游玩时长。
              </p>
              <ol class="nso-steps">
                <li>点击「绑定 Nintendo 账户」，在打开的任天堂登录页完成登录。</li>
                <li>登录后右键“选择此人“按钮，复制链接将会得到 <code>npf...</code> 开头的链接，粘贴至输入框即可</li>
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

            <template v-if="isAdminUser">
            <div class="divider" />
            <div class="sub-head">
              <span class="mini-label">开发者凭据（nxapi znca 代理，全站共享）</span>
              <a class="btn btn-outlined btn-sm" :href="NSO_DOC_URL" target="_blank" rel="noopener">
                <AppIcon name="open_in_new" :size="15" />如何获取？
              </a>
            </div>
            <p class="md-muted tiny" style="margin: 0 0 12px">
              推荐使用 nxapi 官方代理：填写下方代理地址与你注册的 Client ID（Client Secret 可留空），并把“f 参数生成方式“设为“自动“。保存后需重启服务端。
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

            <div class="divider" />
            <div class="sub-head">
              <span class="mini-label">高级选项</span>
            </div>
            <label class="field filled">
              <select v-model="nintendo.provider" class="field-input">
                <option value="auto">自动（有代理地址则用代理，否则 imink）</option>
                <option value="imink">imink</option>
                <option value="flapg">flapg</option>
              </select>
              <span class="field-label">f 参数生成方式</span>
            </label>
            <p class="md-muted tiny" style="margin: -8px 0 12px">
              切换后需重启服务端生效（nxapi 在启动时读取配置）。“自动“= 填了代理地址就用官方代理，否则用 imink。
            </p>
            <div class="theme-row" style="margin: 8px 0 18px">
              <span class="mini-label" style="margin: 0">
                使用 nxapi 远程配置（会禁用直连认证，一般保持关闭）
              </span>
              <label class="switch">
                <input type="checkbox" v-model="nintendo.remoteConfig" />
                <span class="switch-track"><span class="switch-thumb" /></span>
              </label>
            </div>
            <label class="field filled">
              <input v-model="nintendo.configUrl" class="field-input" placeholder=" " />
              <span class="field-label">自定义 nxapi 配置地址（可留空，支持 file:// 或 http(s)://）</span>
            </label>
            </template>
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
            <template v-if="isAdminUser">导入 ZIP 插件包。启用/对访客公开代表执行插件代码，仅管理员可操作。</template>
            <template v-else>插件由管理员安装与启用；你可以查看已安装的插件与配置其权限。</template>
          </p>

          <label v-if="isAdminUser" class="field filled" style="margin-bottom: 16px">
            <select v-model="pluginOwner" class="field-input" @change="loadInstalledPlugins">
              <option value="">我自己（{{ auth.user?.username }}）</option>
              <option v-for="u in pluginUsers" :key="u.username" :value="u.username">
                {{ u.display_name || u.username }}（@{{ u.username }}）
              </option>
            </select>
            <span class="field-label">管理对象</span>
          </label>

          <div v-if="isAdminUser" class="plugin-import">
            <label class="btn btn-filled">
              <span v-if="pluginBusy" class="spinner" style="width: 15px; height: 15px" />
              <AppIcon v-else name="upload" :size="17" />导入插件包（.zip）
              <input type="file" accept=".zip,application/zip" hidden @change="onImportPlugin" />
            </label>
          </div>

          <div v-if="!installedPlugins.length" class="md-muted tiny" style="margin-top: 16px">
            还没有安装任何插件。
          </div>

          <div v-for="p in installedPlugins" :key="p.id" class="plugin-row">
            <div class="plugin-row-main">
              <div class="plugin-name">
                {{ p.name }}
                <span class="md-muted">v{{ p.version }}</span>
                <span v-if="p.error" class="badge hidden-badge">加载失败</span>
                <span v-else-if="p.enabled" class="badge success">已启用</span>
                <span v-if="p.enabled && p.visitor" class="badge">对访客开放</span>
                <span v-if="p.locked" class="badge">已锁定</span>
              </div>
              <p class="md-muted tiny">{{ p.description || '（无描述）' }}</p>
            </div>
            <div class="plugin-row-actions">
              <button class="btn btn-tonal btn-sm" @click="openManage(p)">
                <AppIcon name="settings" :size="16" />管理
              </button>
              <button
                v-if="isAdminUser || !p.locked"
                class="btn btn-outlined btn-sm"
                @click="removePlugin(p)"
              >
                <AppIcon name="delete" :size="16" />删除
              </button>
            </div>
          </div>

          <!-- install confirmation -->
          <BaseDialog
            :open="!!importPreview"
            :title="importPreview?.update ? '更新插件' : '安装插件'"
            :close-on-scrim="!importState.busy"
            @close="closeImportPreview"
          >
            <template v-if="importPreview">
              <div class="plugin-preview">
                <div class="preview-row">
                  <span class="preview-key">插件名称</span>
                  <span class="preview-val">{{ importPreview.name }}</span>
                </div>
                <div class="preview-row">
                  <span class="preview-key">插件 ID</span>
                  <code class="preview-val">{{ importPreview.id }}</code>
                </div>
                <div class="preview-row">
                  <span class="preview-key">版本</span>
                  <span class="preview-val">
                    <template v-if="importPreview.update && importPreview.existingVersion && importPreview.existingVersion !== importPreview.version">
                      <span class="md-muted">v{{ importPreview.existingVersion }}</span>
                      <AppIcon name="arrow_back" :size="14" style="transform: rotate(180deg); vertical-align: middle; margin: 0 4px" />
                      <strong>v{{ importPreview.version }}</strong>
                      <span class="badge success" style="margin-left: 8px">更新</span>
                    </template>
                    <template v-else>v{{ importPreview.version }}</template>
                  </span>
                </div>
                <div class="preview-row">
                  <span class="preview-key">作者</span>
                  <span class="preview-val">{{ importPreview.author || '—' }}</span>
                </div>
                <div class="preview-row">
                  <span class="preview-key">说明</span>
                  <span class="preview-val">{{ importPreview.description || '（无说明）' }}</span>
                </div>
                <div v-if="importPreview.minSdkVersion" class="preview-row">
                  <span class="preview-key">SDK 要求</span>
                  <span class="preview-val" :style="importPreview.sdkOk ? '' : 'color:var(--md-error)'">
                    ≥ {{ importPreview.minSdkVersion }}（当前 {{ importPreview.sdkVersion }}）
                    <span v-if="!importPreview.sdkOk"> · 不满足，无法安装</span>
                    <span v-else class="badge success" style="margin-left: 8px">满足</span>
                  </span>
                </div>
              </div>

              <p v-if="importPreview.update" class="md-muted tiny" style="margin: -4px 0 12px">
                已安装同 ID 插件，本次将视为<strong>更新</strong>并覆盖其代码。
              </p>

              <div class="preview-perms">
                <span class="mini-label">申请的权限</span>
                <div class="perm-chips">
                  <span v-if="!importPreview.permissions.length" class="md-muted tiny">无</span>
                  <span
                    v-for="perm in importPreview.permissions"
                    :key="perm"
                    class="perm-chip"
                    :title="perm"
                  >
                    {{ PERMISSION_LABELS[perm] || perm }}
                  </span>
                </div>
                <p class="md-muted tiny" style="margin-top: 8px">
                  安装后可在下方启用；启用与「对访客开放」代表执行插件代码，仅管理员可操作。
                </p>
              </div>

              <div
                class="backup-progress install-progress"
                :class="{ show: importState.busy, indeterminate: importState.progress === null }"
              >
                <div
                  class="backup-progress-fill"
                  :style="{ width: importState.progress !== null ? `${Math.max(4, Math.round(importState.progress * 100))}%` : '' }"
                />
              </div>
              <p v-if="importState.busy" class="md-muted tiny">{{ importPreview.update ? '正在更新…' : '正在安装…' }}</p>
            </template>

            <template #actions>
              <button class="btn" :disabled="importState.busy" @click="closeImportPreview">取消</button>
              <button
                class="btn btn-filled"
                :disabled="importState.busy || (importPreview ? !importPreview.sdkOk : false)"
                @click="confirmImportPlugin"
              >
                <span v-if="importState.busy" class="spinner" style="width: 15px; height: 15px" />
                <AppIcon v-else name="check" :size="16" />{{ importPreview?.update ? '确认更新' : '确认安装' }}
              </button>
            </template>
          </BaseDialog>

          <!-- manage plugin -->
          <BaseDialog
            :open="!!managedPlugin"
            :title="managedPlugin ? `管理插件 · ${managedPlugin.name}` : ''"
            @close="closeManage"
          >
            <template v-if="managedPlugin">
              <p class="md-muted tiny" style="margin-bottom: 12px">
                v{{ managedPlugin.version }} · ID <code>{{ managedPlugin.id }}</code>
                <template v-if="managedPlugin.author"> · {{ managedPlugin.author }}</template>
              </p>
              <p v-if="managedPlugin.description" class="md-muted" style="margin-bottom: 14px">
                {{ managedPlugin.description }}
              </p>
              <p v-if="managedPlugin.error" class="plugin-error">{{ managedPlugin.error }}</p>

              <div class="plugin-toggles">
                <label class="switch" :title="isAdminUser ? '' : '仅管理员可启用插件'">
                  <input
                    type="checkbox"
                    :checked="managedPlugin.enabled"
                    :disabled="!isAdminUser"
                    @change="updatePlugin(managedPlugin, { enabled: !managedPlugin.enabled })"
                  />
                  <span class="switch-track"><span class="switch-thumb" /></span>
                  <span>启用</span>
                </label>
                <label class="switch" :title="isAdminUser ? '' : '仅管理员可对访客公开'">
                  <input
                    type="checkbox"
                    :checked="managedPlugin.visitor"
                    :disabled="!isAdminUser"
                    @change="updatePlugin(managedPlugin, { visitor: !managedPlugin.visitor })"
                  />
                  <span class="switch-track"><span class="switch-thumb" /></span>
                  <span>对访客开放</span>
                </label>
                <label v-if="isAdminUser" class="switch" title="开启后，插件所有者不可删除该插件">
                  <input
                    type="checkbox"
                    :checked="!!managedPlugin.locked"
                    @change="updatePlugin(managedPlugin, { locked: !managedPlugin.locked })"
                  />
                  <span class="switch-track"><span class="switch-thumb" /></span>
                  <span>禁止用户删除此插件</span>
                </label>
              </div>

              <div v-if="managedPlugin.requestedPermissions.length" class="plugin-perms">
                <span class="mini-label">权限</span>
                <label
                  v-for="perm in managedPlugin.requestedPermissions"
                  :key="perm"
                  class="perm-item"
                  :title="canGrantPerm(perm) ? '' : '管理员未授权你授予该权限'"
                >
                  <input
                    type="checkbox"
                    :checked="managedPlugin.permissions.includes(perm)"
                    :disabled="!canGrantPerm(perm)"
                    @change="togglePermission(managedPlugin, perm)"
                  />
                  <span>{{ PERMISSION_LABELS[perm] || perm }}<span v-if="!canGrantPerm(perm)" class="md-muted">（未授权）</span></span>
                </label>
                <label v-if="managedPlugin.requestedPermissions.includes('token')" class="field filled" style="margin-top: 8px">
                  <input v-model="managedPlugin.token" class="field-input" placeholder=" " @change="updatePlugin(managedPlugin, { token: managedPlugin.token })" />
                  <span class="field-label">访问令牌</span>
                </label>
              </div>

              <div
                v-if="managedPlugin.loaded && (managedPlugin.widgets.length || managedPlugin.pages.length || managedPlugin.postModules.length || managedPlugin.overlays.length || managedPlugin.topbars?.length || managedPlugin.editorTools?.length)"
                class="plugin-contrib"
              >
                <span class="mini-label">提供的内容</span>
                <div v-if="managedPlugin.widgets.length" class="contrib-row">
                  <span class="contrib-label">小组件</span>
                  <button
                    v-for="w in managedPlugin.widgets"
                    :key="w.id"
                    class="btn btn-tonal btn-sm"
                    @click="addWidgetCard(managedPlugin, w)"
                  >
                    <AppIcon name="add" :size="15" />{{ w.title }}
                  </button>
                </div>
                <div v-if="managedPlugin.pages.length" class="contrib-row">
                  <span class="contrib-label">页面</span>
                  <router-link v-for="pg in managedPlugin.pages" :key="pg.id" :to="`/p/${managedPlugin.id}/${pg.id}`" class="chip">
                    {{ pg.title }}
                  </router-link>
                </div>
                <div v-if="managedPlugin.overlays.length" class="contrib-row">
                  <span class="contrib-label">叠加层</span>
                  <span v-for="o in managedPlugin.overlays" :key="o.id" class="chip static">叠加层 · {{ o.id }}</span>
                </div>
                <div v-if="managedPlugin.topbars?.length" class="contrib-row">
                  <span class="contrib-label">顶栏</span>
                  <span v-for="tb in managedPlugin.topbars" :key="tb.id" class="chip static">顶栏 · {{ tb.title }}</span>
                </div>
                <div v-if="managedPlugin.postModules.length" class="contrib-row">
                  <span class="contrib-label">帖子模块</span>
                  <code v-for="m in managedPlugin.postModules" :key="m.id">[[plugin:{{ managedPlugin.id }}/{{ m.id }}]]</code>
                </div>
              </div>
            </template>

            <template #actions>
              <button class="btn btn-filled" @click="closeManage">完成</button>
            </template>
          </BaseDialog>
        </section>

        <!-- plugin-contributed settings panels -->
        <section
          v-for="ps in pluginSettings"
          :key="ps.plugin.id + ':' + ps.setting.id"
          v-show="tab === `plugin:${ps.plugin.id}:${ps.setting.id}`"
          class="card"
        >
          <h2 class="panel-title">{{ ps.setting.title }}</h2>
          <PluginView :plugin="ps.plugin" kind="settings" :id="ps.setting.id" />
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

        <!-- users (admin) -->
        <section v-show="tab === 'users'" class="card">
          <div class="sub-head" style="margin-top: 0">
            <h2 class="panel-title" style="margin: 0">用户管理</h2>
            <button class="btn btn-filled btn-sm" @click="addUserOpen = true">
              <AppIcon name="person_add" :size="16" />添加用户
            </button>
          </div>
          <p class="md-muted panel-hint">管理站点用户与权限（发帖 / 发动态 / 安装插件）。</p>

          <div v-if="usersLoading" class="skeleton" style="height: 120px; border-radius: 20px" />
          <div v-else class="user-list">
            <div v-for="u in users" :key="u.id" class="user-row">
              <router-link class="user-id" :to="`/user/${u.username}`" :title="`进入 @${u.username} 的主页`">
                <span class="avatar sm">{{ (u.display_name || u.username).charAt(0).toUpperCase() }}</span>
                <div class="user-main">
                  <div class="user-name">
                    {{ u.display_name || u.username }}
                    <span v-if="u.role === 'admin'" class="badge">管理员</span>
                  </div>
                  <div class="md-muted tiny">@{{ u.username }} · {{ u.posts }} 帖 · {{ u.moments }} 动态</div>
                </div>
              </router-link>
              <div class="user-perms">
                <label class="perm"><input type="checkbox" :checked="u.role === 'admin' || u.permissions?.post" :disabled="u.role === 'admin'" @change="toggleUserPermission(u, 'post')" />发帖</label>
                <label class="perm"><input type="checkbox" :checked="u.role === 'admin' || u.permissions?.moment" :disabled="u.role === 'admin'" @change="toggleUserPermission(u, 'moment')" />动态</label>
                <label class="perm"><input type="checkbox" :checked="u.role === 'admin' || u.permissions?.plugins" :disabled="u.role === 'admin'" @change="toggleUserPermission(u, 'plugins')" />插件</label>
              </div>
              <div class="user-actions">
                <button class="btn btn-outlined btn-sm" @click="openUserPosts(u)">
                  <AppIcon name="article" :size="15" />帖子
                </button>
                <button class="btn btn-outlined btn-sm" @click="openPluginPerms(u)">
                  <AppIcon name="extension" :size="15" />插件权限
                </button>
                <button class="btn btn-outlined btn-sm" @click="setUserRole(u, u.role === 'admin' ? 'user' : 'admin')">
                  {{ u.role === 'admin' ? '设为普通' : '设为管理员' }}
                </button>
                <button class="icon-btn sm danger" title="删除用户" @click="deleteUser(u)">
                  <AppIcon name="delete" :size="17" />
                </button>
              </div>
            </div>
            <p v-if="!users.length" class="md-muted tiny">还没有其他用户。</p>
          </div>
        </section>

        <!-- storage -->
        <section v-show="tab === 'storage'" class="card">
          <h2 class="panel-title">存储空间</h2>
          <p class="md-muted panel-hint">
            {{ isAdminUser ? '查看服务器磁盘、站点与各用户占用，并清理不需要的空间。' : '查看服务器磁盘与你自己的存储占用。' }}
          </p>

          <div v-if="storageLoading || !storage" class="skeleton" style="height: 160px; border-radius: 20px" />
          <template v-else>
            <div class="storage-block">
              <div class="storage-row-head">
                <span class="mini-label">服务器磁盘</span>
                <span class="md-muted">
                  已用 {{ fmtBytes(storage.disk.used) }} / {{ fmtBytes(storage.disk.total) }} · 剩余 {{ fmtBytes(storage.disk.free) }}
                </span>
              </div>
              <div class="storage-bar">
                <div class="storage-bar-fill" :style="{ width: storagePct(storage.disk.used, storage.disk.total) + '%' }" />
              </div>
            </div>

            <template v-if="storage.limited">
              <div class="storage-cats">
                <div class="storage-cat">
                  <span class="sc-icon"><AppIcon name="person" :size="18" /></span>
                  <div class="sc-main"><strong>我的存储</strong><span class="md-muted">{{ storage.own?.name || '我' }}</span></div>
                  <span class="sc-size">{{ fmtBytes(storage.own?.bytes || 0) }}</span>
                </div>
                <div class="storage-cat">
                  <span class="sc-icon"><AppIcon name="group" :size="18" /></span>
                  <div class="sc-main"><strong>其他用户的数据</strong><span class="md-muted">合计</span></div>
                  <span class="sc-size">{{ fmtBytes(storage.others || 0) }}</span>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="storage-block">
                <div class="storage-row-head">
                  <span class="mini-label">站点占用</span>
                  <strong>{{ fmtBytes(storage.site.bytes) }}</strong>
                </div>
                <div class="storage-parts">
                  <div v-for="part in storage.site.parts" :key="part.id" class="storage-part">
                    <span>{{ part.label }}</span><span class="md-muted">{{ fmtBytes(part.bytes) }}</span>
                  </div>
                </div>
              </div>

              <div class="sub-head"><span class="mini-label">分类占用</span></div>
              <div v-if="storage.categories" class="storage-cats">
                <div class="storage-cat">
                  <span class="sc-icon"><AppIcon name="article" :size="18" /></span>
                  <div class="sc-main"><strong>帖子</strong><span class="md-muted">图片 {{ storage.categories.posts.files || 0 }} 个</span></div>
                  <span class="sc-size">{{ fmtBytes(storage.categories.posts.bytes) }}</span>
                </div>
                <div class="storage-cat">
                  <span class="sc-icon"><AppIcon name="chat" :size="18" /></span>
                  <div class="sc-main"><strong>动态</strong><span class="md-muted">图片 {{ storage.categories.moments.files || 0 }} 个</span></div>
                  <span class="sc-size">{{ fmtBytes(storage.categories.moments.bytes) }}</span>
                </div>
                <div class="storage-cat">
                  <span class="sc-icon"><AppIcon name="settings" :size="18" /></span>
                  <div class="sc-main"><strong>站点系统</strong><span class="md-muted">数据库与站点素材</span></div>
                  <span class="sc-size">{{ fmtBytes(storage.categories.system.bytes) }}</span>
                </div>
              </div>

              <div class="storage-block">
                <div class="storage-row-head"><span class="mini-label">各用户占用</span><span class="md-muted">{{ storage.users.length }} 位</span></div>
                <div v-for="u in storage.users" :key="u.id" class="storage-plugin">
                  <div class="sc-main">
                    <strong>{{ u.name }}</strong>
                    <span class="md-muted">@{{ u.username }}{{ u.role === 'admin' ? ' · 管理员' : '' }}</span>
                  </div>
                  <span class="sc-size">{{ fmtBytes(u.bytes) }}</span>
                </div>
              </div>

              <div v-if="storage.categories" class="storage-block">
                <div class="storage-row-head"><span class="mini-label">插件</span><span class="md-muted">{{ storage.categories.plugins.length }} 个</span></div>
                <div v-for="pl in storage.categories.plugins" :key="(pl.owner || '') + ':' + pl.id" class="storage-plugin">
                  <div class="sc-main">
                    <strong>{{ pl.name }}</strong>
                    <span class="md-muted">{{ pl.files }} 个文件 · {{ pl.enabled ? '已启用' : '已停用' }}<template v-if="pl.owner"> · @{{ pl.owner }}</template></span>
                  </div>
                  <span class="sc-size">{{ fmtBytes(pl.bytes) }}</span>
                  <button class="btn btn-danger btn-sm" :disabled="!pl.bytes" @click="clearPluginStorage(pl.owner || '', pl.id, pl.name)">清空</button>
                </div>
                <p v-if="!storage.categories.plugins.length" class="md-muted tiny">还没有安装插件。</p>
              </div>

              <p class="md-muted tiny" style="margin-top: 4px">
                孤立文件：{{ storage.uploads.orphanCount || 0 }} 个（{{ fmtBytes(storage.uploads.orphan) }}）。
              </p>

              <div class="panel-actions">
                <button class="btn btn-outlined" @click="loadStorage"><AppIcon name="refresh" :size="16" />刷新</button>
                <button class="btn btn-outlined" @click="cleanOrphans"><AppIcon name="delete" :size="16" />清理孤立文件</button>
                <button class="btn btn-outlined" @click="vacuumDb"><AppIcon name="storage" :size="16" />整理数据库</button>
              </div>
            </template>
          </template>
        </section>

    <!-- add user -->
    <BaseDialog :open="addUserOpen" title="添加用户" @close="addUserOpen = false">
      <label class="field filled">
        <input v-model="newUser.username" class="field-input" placeholder=" " />
        <span class="field-label">用户名（3-32 位字母数字，用于登录）</span>
      </label>
      <label class="field filled">
        <input v-model="newUser.displayName" class="field-input" placeholder=" " />
        <span class="field-label">昵称</span>
      </label>
      <label class="field filled">
        <input v-model="newUser.password" type="password" class="field-input" placeholder=" " />
        <span class="field-label">密码（至少 6 位）</span>
      </label>
      <div class="perm-row">
        <span class="mini-label">权限</span>
        <label class="perm"><input type="checkbox" v-model="newUser.post" />发帖</label>
        <label class="perm"><input type="checkbox" v-model="newUser.moment" />发动态</label>
        <label class="perm"><input type="checkbox" v-model="newUser.plugins" />安装插件</label>
        <label class="perm">
          <input type="checkbox" :checked="newUser.role === 'admin'" @change="newUser.role = ($event.target as HTMLInputElement).checked ? 'admin' : 'user'" />管理员
        </label>
      </div>
      <template #actions>
        <button class="btn" @click="addUserOpen = false">取消</button>
        <button class="btn btn-filled" :disabled="userSaving" @click="createUser">
          <AppIcon name="check" :size="16" />创建
        </button>
      </template>
    </BaseDialog>

    <!-- user posts -->
    <BaseDialog
      :open="postsDialog.open"
      :title="`${postsDialog.user?.display_name || postsDialog.user?.username || ''} 的帖子`"
      wide
      @close="postsDialog.open = false"
    >
      <div v-if="postsDialog.loading" class="skeleton" style="height: 100px; border-radius: 16px" />
      <div v-else class="user-posts">
        <div v-for="p in postsDialog.posts" :key="p.id" class="user-post-row">
          <div class="up-main">
            <div class="up-title">{{ p.title }}</div>
            <div class="md-muted tiny">{{ p.status }} · {{ p.created_at }}</div>
          </div>
          <button class="btn btn-outlined btn-sm" @click="toggleUserPostStatus(p)">
            {{ p.status === 'published' ? '隐藏' : '发布' }}
          </button>
          <button class="icon-btn sm danger" title="删除" @click="deleteUserPost(p)">
            <AppIcon name="delete" :size="17" />
          </button>
        </div>
        <p v-if="!postsDialog.posts.length" class="md-muted tiny">该用户还没有帖子。</p>
      </div>
    </BaseDialog>

    <!-- per-user grantable plugin permissions -->
    <BaseDialog :open="pluginPermDialog.open" title="可授予插件的权限" @close="pluginPermDialog.open = false">
      <p class="md-muted tiny" style="margin-top: 0">
        勾选该用户安装插件时<strong>允许授予</strong>的权限。未勾选的权限，用户无法授予其安装的插件。
      </p>
      <div class="perm-grid">
        <label v-for="perm in KNOWN_PLUGIN_PERMS" :key="perm.id" class="perm">
          <input type="checkbox" :checked="pluginPermDialog.perms.includes(perm.id)" @change="togglePluginPerm(perm.id)" />
          {{ perm.label }}
        </label>
      </div>
      <template #actions>
        <button class="btn" @click="pluginPermDialog.open = false">取消</button>
        <button class="btn btn-filled" @click="savePluginPerms"><AppIcon name="check" :size="16" />保存</button>
      </template>
    </BaseDialog>

        <!-- backup -->
        <section v-show="tab === 'backup'" class="card">
          <h2 class="panel-title">备份与迁移</h2>
          <p class="md-muted panel-hint">
            将整个站点的数据导出为一个 ZIP 文件
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

/* ---------------- storage ---------------- */
.storage-block {
  padding: 16px;
  border-radius: 20px;
  background: var(--md-surface-container-low);
  border: 1px solid color-mix(in srgb, var(--md-outline-variant) 45%, transparent);
  margin-bottom: 14px;
}
.storage-row-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.storage-bar {
  height: 10px;
  border-radius: 999px;
  background: var(--md-surface-container-highest);
  overflow: hidden;
}
.storage-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--md-primary), var(--md-tertiary));
  transition: width var(--md-dur-long) var(--md-ease-emphasized);
}
.storage-parts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 6px 18px;
}
.storage-part {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.86rem;
  padding: 4px 0;
  border-bottom: 1px dashed color-mix(in srgb, var(--md-outline-variant) 40%, transparent);
}
.storage-cats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.storage-cat {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--md-surface-container-high);
  border: 1px solid color-mix(in srgb, var(--md-outline-variant) 45%, transparent);
}
.sc-icon {
  width: 38px;
  height: 38px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}
.sc-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sc-main strong {
  font-size: 0.9rem;
}
.sc-main span {
  font-size: 0.74rem;
}
.sc-size {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.storage-plugin {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
  border-top: 1px solid color-mix(in srgb, var(--md-outline-variant) 40%, transparent);
}
.storage-plugin:first-of-type {
  border-top: none;
}

/* ---------------- users ---------------- */
.user-list { display: flex; flex-direction: column; gap: 8px; }
.user-row {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 18px;
  background: var(--md-surface-container-high);
  border: 1px solid color-mix(in srgb, var(--md-outline-variant) 45%, transparent);
  flex-wrap: wrap;
}
.user-id {
  display: flex; align-items: center; gap: 12px; flex: 1; min-width: 160px;
  color: inherit; text-decoration: none; border-radius: 14px; padding: 2px 4px; margin: -2px -4px;
  transition: background-color var(--md-dur-short) var(--md-ease-standard);
}
.user-id:hover { background: color-mix(in srgb, var(--md-primary) 8%, transparent); text-decoration: none; }
.user-id:hover .user-name { color: var(--md-primary); }
.user-main { flex: 1; min-width: 160px; }
.user-name { display: flex; align-items: center; gap: 8px; font-weight: 700; }
.user-perms { display: flex; gap: 10px; flex-wrap: wrap; }
.perm { display: inline-flex; align-items: center; gap: 5px; font-size: 0.8rem; color: var(--md-on-surface-variant); }
.perm input { accent-color: var(--md-primary); }
.user-actions { display: flex; align-items: center; gap: 6px; }
.perm-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 6px 0 4px; }
.perm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px 16px; margin: 8px 0; }
.user-posts { display: flex; flex-direction: column; gap: 6px; }
.user-post-row {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px;
  background: var(--md-surface-container-high);
}
.up-main { flex: 1; min-width: 0; }
.up-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.plugin-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.preview-row {
  display: flex;
  gap: 12px;
  align-items: baseline;
}
.preview-key {
  flex: none;
  width: 72px;
  color: var(--md-on-surface-variant);
  font-size: 0.82rem;
}
.preview-val {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}
code.preview-val {
  font-family: var(--md-font-mono, ui-monospace, monospace);
  background: var(--md-surface-container-high);
  padding: 1px 7px;
  border-radius: var(--md-shape-sm);
  font-size: 0.85rem;
}
.preview-perms {
  margin-bottom: 8px;
}
.perm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.perm-chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: var(--md-shape-full);
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
  font-size: 0.8rem;
}
.install-progress {
  margin-top: 12px;
}
.plugin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-lg);
  background: var(--md-surface-container-low);
  margin-bottom: 10px;
}
.plugin-row-main {
  min-width: 0;
}
.plugin-row-main .plugin-name {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.plugin-row-main .md-muted {
  margin: 4px 0 0;
}
.plugin-row-actions {
  display: flex;
  gap: 8px;
  flex: none;
}
</style>