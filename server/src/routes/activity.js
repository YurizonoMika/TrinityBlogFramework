// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import { getSetting } from '../db.js'
import { getNintendoActivity } from '../nintendo.js'

const router = Router()

const cache = new Map()
const TTL = 5 * 60 * 1000

async function cached(key, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.value
  const value = await fn()
  cache.set(key, { at: Date.now(), value })
  return value
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'homepage-app', Accept: 'application/json', ...headers },
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json()
}

async function githubActivity(cfg) {
  const username = cfg?.username
  if (!username) return { configured: false }
  const headers = cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}
  try {
    return await cached(`gh:${username}`, async () => {
      const [user, events] = await Promise.all([
        fetchJson(`https://api.github.com/users/${encodeURIComponent(username)}`, headers),
        fetchJson(
          `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=10`,
          headers
        ),
      ])
      return {
        configured: true,
        ok: true,
        username,
        avatar: user.avatar_url,
        name: user.name,
        bio: user.bio,
        repos: user.public_repos,
        followers: user.followers,
        following: user.following,
        events: events.slice(0, 8).map((e) => ({
          id: e.id,
          type: e.type,
          repo: e.repo?.name,
          createdAt: e.created_at,
          action: describeEvent(e),
        })),
      }
    })
  } catch (err) {
    return { configured: true, ok: false, username, error: String(err.message || err) }
  }
}

function describeEvent(e) {
  switch (e.type) {
    case 'PushEvent':
      return `推送了 ${e.payload?.commits?.length || 0} 个提交到 ${e.payload?.ref?.replace('refs/heads/', '')}`
    case 'PullRequestEvent':
      return `${e.payload?.action} PR #${e.payload?.number}`
    case 'IssuesEvent':
      return `${e.payload?.action} issue #${e.payload?.issue?.number}`
    case 'CreateEvent':
      return `创建了 ${e.payload?.ref_type || '仓库'}`
    case 'WatchEvent':
      return '收藏了仓库'
    case 'ForkEvent':
      return 'Fork 了仓库'
    case 'ReleaseEvent':
      return `发布了 ${e.payload?.release?.tag_name || '版本'}`
    default:
      return e.type.replace('Event', '')
  }
}

async function steamActivity(cfg) {
  const { apiKey, steamId } = cfg || {}
  if (!steamId) return { configured: false }
  if (!apiKey) return { configured: true, ok: false, steamId, error: '缺少 Steam API Key' }
  try {
    return await cached(`steam:${steamId}`, async () => {
      const [summary, recent] = await Promise.all([
        fetchJson(
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`
        ),
        fetchJson(
          `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${apiKey}&steamid=${steamId}&count=6`
        ),
      ])
      const player = summary?.response?.players?.[0] || null
      const games = (recent?.response?.games || []).map((g) => ({
        appid: g.appid,
        name: g.name,
        playtime: Math.round(g.playtime_2weeks / 60 * 10) / 10,
        total: Math.round(g.playtime_forever / 60),
        icon: `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`,
      }))
      return {
        configured: true,
        ok: true,
        steamId,
        player: player
          ? { name: player.personaname, avatar: player.avatarfull, state: player.personastate }
          : null,
        games,
      }
    })
  } catch (err) {
    return { configured: true, ok: false, steamId, error: String(err.message || err) }
  }
}

async function nintendoActivity(cfg) {
  const live = await getNintendoActivity()
  const { friendCode, games } = cfg || {}
  const manualGames = Array.isArray(games) ? games : []
  const hasManual = Boolean(friendCode) || manualGames.length > 0

  if (live.configured && live.ok) return live

  if (live.configured && live.ok === false) {
    if (hasManual) {
      return {
        ...live,
        degraded: true,
        friendCode: friendCode || '',
        games: manualGames,
        note: '实时同步暂不可用，以下为手动维护的记录。',
      }
    }
    return live
  }

  if (!hasManual) return { configured: false }
  return {
    configured: true,
    ok: true,
    linked: false,
    friendCode: friendCode || '',
    games: manualGames,
    note: 'Nintendo 暂无官方公开 API，游戏记录可在设置中手动维护。',
  }
}

router.get('/', async (req, res) => {
  const integrations = getSetting('integrations', {})
  const requested = String(req.query.providers || 'github,steam,nintendo')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const result = {}
  await Promise.all(
    requested.map(async (provider) => {
      if (provider === 'github') result.github = await githubActivity(integrations.github)
      else if (provider === 'steam') result.steam = await steamActivity(integrations.steam)
      else if (provider === 'nintendo') result.nintendo = await nintendoActivity(integrations.nintendo)
    })
  )
  res.json({ activity: result, fetchedAt: new Date().toISOString() })
})

export default router
