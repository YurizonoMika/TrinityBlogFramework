// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

export interface User {
  id: number
  username: string
  display_name: string
  email: string
  avatar: string
  bio: string
  created_at: string
}

export interface Post {
  id: number
  title: string
  slug: string
  summary: string
  content: string
  cover: string
  tags: string[]
  category?: string
  status: 'published' | 'hidden' | 'draft'
  author_id: number | null
  views: number
  created_at: string
  updated_at: string
}

export interface Moment {
  id: number
  content: string
  images: string[]
  author_id: number | null
  created_at: string
  updated_at: string
}

export type CardType =
  | 'profile'
  | 'activity'
  | 'posts'
  | 'markdown'
  | 'links'
  | 'plugin'
  | 'plugin-widget'

export interface PluginPage {
  id: string
  title: string
  icon?: string
}
export interface PluginOverlay {
  id: string
  pages: string[]
}
export interface PluginEditorTool {
  id: string
  label: string
  icon: string
}

export interface RuntimePlugin {
  id: string
  name: string
  version: string
  rev: string
  hasUi: boolean
  hasJs: boolean
  assetBase: string
  capabilities: Record<string, boolean>
  pages: PluginPage[]
  widgets: PluginPage[]
  overlays: PluginOverlay[]
  postModules: PluginPage[]
  editorTools: PluginEditorTool[]
  cardSources: { id: string }[]
}

export interface InstalledPlugin {
  id: string
  name: string
  version: string
  description: string
  author: string
  capabilities: Record<string, boolean>
  requestedPermissions: string[]
  hasUi: boolean
  hasSources: boolean
  hasApp: boolean
  enabled: boolean
  visitor: boolean
  permissions: string[]
  token?: string
  loaded: boolean
  error: string | null
  widgets: PluginPage[]
  pages: PluginPage[]
  postModules: PluginPage[]
  editorTools: PluginEditorTool[]
  cardSources: { id: string }[]
}
export interface Card {
  id: string
  type: CardType
  title: string
  config: Record<string, any>
  position: number
  width: 'half' | 'full'
  visible: boolean
}

export interface SiteSettings {
  title?: string
  subtitle?: string
  description?: string
  accent?: string
  footer?: string
  icon?: string
  banner?: string
  themeMode?: 'preset' | 'dynamic'
  themeSource?: 'icon' | 'banner' | 'custom'
  themeSeed?: string
  themeSeedColor?: string
}

export interface Integrations {
  github?: { username?: string; token?: string }
  steam?: { steamId?: string; apiKey?: string }
  nintendo?: { friendCode?: string; games?: { name: string; playtime?: string }[] }
}

export interface LinkItem {
  label: string
  url: string
  icon?: string
}

export interface ProfileTag {
  label: string
  icon?: string
}

export interface PublicProfile {
  display_name: string
  username: string
  avatar: string
  bio: string
  email: string
  links: LinkItem[]
  tags: ProfileTag[]
}

export interface ActivityGithub {
  configured: boolean
  ok?: boolean
  username?: string
  avatar?: string
  name?: string
  bio?: string
  repos?: number
  followers?: number
  following?: number
  events?: { id: string; type: string; repo: string; createdAt: string; action: string }[]
  error?: string
}

export interface SteamGame {
  appid: number
  name: string
  playtime: number
  total: number
  icon: string
}

export interface ActivitySteam {
  configured: boolean
  ok?: boolean
  steamId?: string
  player?: { name: string; avatar: string; state: number } | null
  games?: SteamGame[]
  error?: string
}

export type NsoPresenceState = 'OFFLINE' | 'INACTIVE' | 'ONLINE' | 'PLAYING'

export interface NsoGame {
  name: string
  imageUri: string
  shopUri: string
  totalPlayTime: number
}

export interface NsoFriend {
  nsaId: string
  name: string
  imageUri: string
  isFavoriteFriend: boolean
  state: NsoPresenceState
  updatedAt: number
  game: NsoGame | null
}

export interface NsoUser {
  nsaId: string
  name: string
  imageUri: string
  friendCode: string
  membershipActive: boolean
}

export interface NsoNowPlaying {
  source: 'self' | 'friend'
  game: NsoGame
  user: string
}

export interface ActivityNintendo {
  configured: boolean
  ok?: boolean
  linked?: boolean
  degraded?: boolean
  user?: NsoUser | null
  friendCode?: string
  recent?: NsoGame | null
  recentGames?: NsoGame[]
  nowPlaying?: NsoNowPlaying | null
  games?: { name: string; playtime?: string }[]
  note?: string
  error?: string
  errorCode?: 'reauth' | 'fgen' | 'clientsetup' | 'update' | 'error' | string
}

export interface ActivityResponse {
  activity: {
    github?: ActivityGithub
    steam?: ActivitySteam
    nintendo?: ActivityNintendo
  }
  fetchedAt: string
}
