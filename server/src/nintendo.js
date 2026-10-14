// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  DATA_DIR,
  getSetting,
  setSetting,
  getUserSetting,
  setUserSetting,
  primaryUserId,
} from './db.js'

/*
 * Multi-user Nintendo (NSO) support:
 *  - The nxapi znca-proxy / provider configuration (URL, client id/secret,
 *    provider, remote config) is SERVER-LEVEL (settings key `nintendo_server`,
 *    edited by the admin) — nxapi reads it from process-wide env, so it cannot
 *    be per-user.
 *  - Each user binds their OWN Nintendo account (session token) and gets their
 *    own Coral client + activity, stored per user.
 */

const IMINK_CONFIG_URL = 'https://api.imink.app/config'
const NXAPI_UA = 'homepage/1.0.0'
const NA_CLIENT_ID = '71b963c1b7b6d119'
const NA_SCOPE = 'openid user user.birthday user.screenName'
const REDIRECT_URI = 'npf' + NA_CLIENT_ID + '://auth'
const AUTHORIZE_URL = 'https://accounts.nintendo.com/connect/1.0.0/authorize'
const SESSION_TOKEN_URL = 'https://accounts.nintendo.com/connect/1.0.0/api/session_token'
const AUTH_KEY = 'nintendo_auth'
const PENDING_TTL = 15 * 60 * 1000

let modulePromise = null
let configPromise = null
const CACHE_TTL = 2 * 60 * 1000

const coralCache = new Map() // userId -> Coral client
const activityCache = new Map() // userId -> { at, value }
const pendingByUser = new Map() // userId -> Map<state, { verifier, createdAt }>

let appliedEnvSignature = null

// values provided by the environment (e.g. a .env file) act as a fallback so we
// never wipe a working proxy credential with an empty settings value
const BASE_ENV = {
  url: process.env.ZNCA_API_URL || '',
  id: process.env.NXAPI_ZNCA_API_CLIENT_ID || '',
  secret: process.env.NXAPI_ZNCA_API_CLIENT_SECRET || '',
  provider: process.env.NXAPI_ZNCA_API || '',
}

function setEnvVar(name, value) {
  if (value === undefined || value === null || value === '') delete process.env[name]
  else process.env[name] = value
}

/** One-time: carry the pre-multi-user global Nintendo binding to the admin. */
function migrateLegacyAuth() {
  const admin = primaryUserId()
  if (admin == null) return
  if (getUserSetting(admin, AUTH_KEY, null)) return
  const legacy = getSetting(AUTH_KEY, null)
  if (legacy && typeof legacy === 'object' && legacy.sessionToken) {
    setUserSetting(admin, AUTH_KEY, legacy)
  }
}

/** Server-level nxapi provider config (migrated from the admin's integration once). */
function nintendoServerConfig() {
  migrateLegacyAuth()
  const admin = primaryUserId()
  const n = admin ? (getUserSetting(admin, 'integrations', {}) || {}).nintendo || {} : {}
  const fromIntegration = {
    zncaApiUrl: n.zncaApiUrl || '',
    clientId: n.clientId || '',
    clientSecret: n.clientSecret || '',
    provider: n.provider === 'imink' || n.provider === 'flapg' ? n.provider : '',
    remoteConfig: n.remoteConfig === true,
    configUrl: n.configUrl || '',
  }

  let cfg = getSetting('nintendo_server', null)
  if (!cfg || typeof cfg !== 'object') {
    cfg = fromIntegration
    setSetting('nintendo_server', cfg)
  } else {
    // backfill any field that is still empty from the owner's integration
    const next = { ...cfg }
    let changed = false
    for (const [key, value] of Object.entries(fromIntegration)) {
      if ((next[key] === undefined || next[key] === '' || next[key] === false) && value !== '' && value !== false) {
        next[key] = value
        changed = true
      }
    }
    if (changed) {
      cfg = next
      setSetting('nintendo_server', cfg)
    }
  }
  return cfg
}

export function getNintendoServerConfig() {
  return nintendoServerConfig()
}

export function setNintendoServerConfig(patch = {}) {
  const next = { ...nintendoServerConfig() }
  for (const key of ['zncaApiUrl', 'clientId', 'clientSecret', 'provider', 'configUrl']) {
    if (patch[key] !== undefined) next[key] = String(patch[key] ?? '')
  }
  if (patch.remoteConfig !== undefined) next.remoteConfig = patch.remoteConfig === true
  setSetting('nintendo_server', next)
  resetNintendoConfig()
  return next
}

function applyNxapiEnv() {
  const nintendo = nintendoServerConfig()
  const url = String(nintendo.zncaApiUrl || '').trim()
  const id = String(nintendo.clientId || '').trim()
  const secret = String(nintendo.clientSecret || '').trim()
  const provider =
    nintendo.provider === 'imink' || nintendo.provider === 'flapg' ? nintendo.provider : ''
  const configUrl = String(nintendo.configUrl || '').trim()
  const remoteConfig = nintendo.remoteConfig === true

  const effUrl = url || BASE_ENV.url
  const effId = id || BASE_ENV.id
  const effSecret = secret || BASE_ENV.secret
  const effProvider = provider || BASE_ENV.provider

  const signature = `${effUrl}|${effId}|${effSecret}|${effProvider}|${configUrl}|${remoteConfig}`
  if (signature === appliedEnvSignature) return
  appliedEnvSignature = signature

  setEnvVar('ZNCA_API_URL', effUrl)
  setEnvVar('NXAPI_ZNCA_API_CLIENT_ID', effId)
  setEnvVar('NXAPI_ZNCA_API_CLIENT_SECRET', effSecret)
  setEnvVar('NXAPI_ZNCA_API', effProvider)

  if (configUrl) {
    setEnvVar('NXAPI_CONFIG_URL', configUrl)
    delete process.env.NXAPI_ENABLE_REMOTE_CONFIG
  } else if (remoteConfig) {
    delete process.env.NXAPI_CONFIG_URL
    setEnvVar('NXAPI_ENABLE_REMOTE_CONFIG', '1')
  } else {
    delete process.env.NXAPI_CONFIG_URL
    delete process.env.NXAPI_ENABLE_REMOTE_CONFIG
  }

  configPromise = null
  coralCache.clear()
  activityCache.clear()
}

/** Force a full reload of nxapi config / Coral auth (e.g. after saving settings). */
export function resetNintendoConfig() {
  appliedEnvSignature = null
  configPromise = null
  coralCache.clear()
  activityCache.clear()
}

function installedNxapiVersion() {
  try {
    const require = createRequire(import.meta.url)
    const pkgPath = join(dirname(require.resolve('nxapi')), '..', '..', 'package.json')
    const raw = JSON.parse(readFileSync(pkgPath, 'utf-8')).version
    const match = String(raw).match(/^(\d+\.\d+\.\d+)-next\b/i)
    return match ? match[1] : raw
  } catch {
    return null
  }
}

function requestedProvider() {
  const nintendo = nintendoServerConfig()
  const explicit =
    nintendo.provider === 'imink' || nintendo.provider === 'flapg' ? nintendo.provider : ''
  const url = String(nintendo.zncaApiUrl || '').trim().replace(/\/+$/, '')
  if (explicit) return { provider: explicit, url }
  return { provider: url ? ['nxapi', url] : 'imink', url }
}

function readBundledCoralVersion() {
  try {
    const require = createRequire(import.meta.url)
    const file = join(
      dirname(require.resolve('nxapi')),
      '..',
      '..',
      'resources',
      'common',
      'remote-config.json',
    )
    return JSON.parse(readFileSync(file, 'utf-8'))?.coral?.znca_version || null
  } catch {
    return null
  }
}

async function readProviderConfig() {
  const { provider, url } = requestedProvider()
  if (provider === 'flapg') {
    const version = readBundledCoralVersion()
    return version ? { version, provider } : null
  }
  const configUrl = provider === 'imink' ? IMINK_CONFIG_URL : `${url}/config`
  try {
    const res = await fetch(configUrl, {
      headers: { 'User-Agent': NXAPI_UA },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    const version = data?.nso_version || data?.versions?.[0]?.version
    if (version) return { version: String(version), provider }
  } catch (err) {
    console.warn('[nintendo] could not read provider config:', err?.message || err)
  }
  return null
}

async function prepareConfig() {
  applyNxapiEnv()
  if (configPromise) return configPromise
  configPromise = (async () => {
    if (process.env.NXAPI_CONFIG_URL || process.env.NXAPI_ENABLE_REMOTE_CONFIG === '1') return
    const nxapiVersion = installedNxapiVersion()
    const info = await readProviderConfig()
    if (info && nxapiVersion) {
      const config = {
        require_version: [nxapiVersion],
        coral: { znca_version: info.version },
        coral_auth: {
          default: info.provider,
          splatnet2statink: null,
          flapg: info.provider === 'flapg' ? {} : null,
          imink: {},
        },
        moon: null,
        coral_gws_nooklink: null,
        coral_gws_splatnet3: null,
      }
      const file = join(DATA_DIR, 'nxapi-config.json')
      writeFileSync(file, JSON.stringify(config, null, 2))
      process.env.NXAPI_CONFIG_URL = pathToFileURL(file).href
      const label = Array.isArray(info.provider) ? `nxapi ${info.provider[1]}` : info.provider
      console.log(`[nintendo] nxapi config → ${label}, NSO ${info.version}, nxapi ${nxapiVersion}`)
      return
    }
    if (process.env.NXAPI_ENABLE_REMOTE_CONFIG === undefined) {
      process.env.NXAPI_ENABLE_REMOTE_CONFIG = '0'
      console.warn('[nintendo] provider config unavailable; using bundled nxapi config')
    }
  })()
  return configPromise
}

async function loadCoral() {
  if (!modulePromise) {
    modulePromise = (async () => {
      await prepareConfig()
      const [nxapi, coral] = await Promise.all([import('nxapi'), import('nxapi/coral')])
      nxapi.addUserAgent('homepage/1.0.0 (+https://localhost)')
      return { CoralApi: coral.default, PresenceState: coral.PresenceState }
    })()
  }
  return modulePromise
}

let remoteConfigModulePromise = null
function loadRemoteConfigModule() {
  if (!remoteConfigModulePromise) {
    remoteConfigModulePromise = (async () => {
      try {
        const require = createRequire(import.meta.url)
        const file = join(dirname(require.resolve('nxapi')), '..', 'common', 'remote-config.js')
        return await import(pathToFileURL(file).href)
      } catch (err) {
        console.warn('[nintendo] could not load nxapi config module:', err?.message || err)
        return null
      }
    })()
  }
  return remoteConfigModulePromise
}

async function syncRuntimeConfig() {
  const mod = await loadRemoteConfigModule()
  const config = mod?.default
  if (!config?.coral || !config?.coral_auth) return
  const info = await readProviderConfig()
  const { provider } = requestedProvider()
  if (info) config.coral.znca_version = info.version
  config.coral_auth.default = provider
  config.coral_auth.imink = {}
  config.coral_auth.flapg = {}
}

/* ---------------- per-user auth ---------------- */

function readAuth(userId) {
  return getUserSetting(userId, AUTH_KEY, null) || {}
}
function writeAuth(userId, patch) {
  const next = { ...readAuth(userId), ...patch }
  setUserSetting(userId, AUTH_KEY, next)
  return next
}

export function isLinked(userId) {
  return Boolean(readAuth(userId).sessionToken)
}

export function authStatus(userId) {
  const auth = readAuth(userId)
  return {
    linked: Boolean(auth.sessionToken),
    user: auth.user || null,
    coralExpiresAt: auth.coralExpiresAt || null,
  }
}

export function createAuthoriseUrl(userId) {
  const state = crypto.randomBytes(36).toString('base64url')
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest().toString('base64url')

  const params = new URLSearchParams({
    state,
    redirect_uri: REDIRECT_URI,
    client_id: NA_CLIENT_ID,
    scope: NA_SCOPE,
    response_type: 'session_token_code',
    session_token_code_challenge: challenge,
    session_token_code_challenge_method: 'S256',
    theme: 'login_form',
  })

  let pending = pendingByUser.get(userId)
  if (!pending) {
    pending = new Map()
    pendingByUser.set(userId, pending)
  }
  const now = Date.now()
  for (const [key, value] of pending) {
    if (now - value.createdAt > PENDING_TTL) pending.delete(key)
  }
  pending.set(state, { verifier, createdAt: now })
  return { url: `${AUTHORIZE_URL}?${params.toString()}`, state }
}

export function parseRedirectInput(input) {
  const raw = String(input || '').trim()
  if (!raw) return { code: '', state: null }
  const hashIndex = raw.indexOf('#')
  const candidate = hashIndex >= 0 ? raw.slice(hashIndex + 1) : raw
  if (candidate.includes('session_token_code=') || candidate.includes('state=')) {
    const params = new URLSearchParams(candidate)
    return { code: params.get('session_token_code') || '', state: params.get('state') }
  }
  const match = raw.match(/session_token_code=([^&\s]+)/)
  if (match) {
    const stateMatch = raw.match(/state=([^&\s]+)/)
    return { code: match[1], state: stateMatch ? stateMatch[1] : null }
  }
  return { code: raw, state: null }
}

export async function exchangeCode(userId, input) {
  const { code, state } = parseRedirectInput(input)
  if (!code) throw new Error('未能识别 session_token_code，请粘贴完整的重定向链接')

  const pending = pendingByUser.get(userId)
  let entry = state && pending ? pending.get(state) : null
  if (!entry && pending && pending.size === 1) entry = pending.values().next().value
  if (!entry) throw new Error('授权已过期，请重新点击「绑定 Nintendo 账户」')

  const res = await fetch(SESSION_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'NASDKAPI; Android',
    },
    body: new URLSearchParams({
      client_id: NA_CLIENT_ID,
      session_token_code: code,
      session_token_code_verifier: entry.verifier,
    }).toString(),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error || data.errorCode) {
    throw new Error(data.error_description || data.detail || `授权失败 (${res.status})`)
  }
  if (!data.session_token) throw new Error('任天堂未返回 session_token')

  pendingByUser.delete(userId)
  coralCache.delete(userId)
  activityCache.delete(userId)
  writeAuth(userId, { sessionToken: data.session_token, coral: null, coralExpiresAt: null, user: null })
  return { linked: true }
}

export async function unlink(userId) {
  setUserSetting(userId, AUTH_KEY, {})
  coralCache.delete(userId)
  activityCache.delete(userId)
}

/** Clear in-memory auth/cache for a user (e.g. after importing a backup). */
export function resetCache(userId) {
  coralCache.delete(userId)
  activityCache.delete(userId)
}

async function getCoral(userId) {
  applyNxapiEnv()
  const auth = readAuth(userId)
  if (!auth.sessionToken) return null
  const { CoralApi } = await loadCoral()

  const cached = coralCache.get(userId)
  if (cached) return cached

  await syncRuntimeConfig()

  let coral
  if (auth.coral && auth.coralExpiresAt && auth.coralExpiresAt > Date.now()) {
    coral = CoralApi.createWithSavedToken(auth.coral)
  } else {
    const { nso, data } = await CoralApi.createWithSessionToken(auth.sessionToken)
    writeAuth(userId, {
      coral: data,
      coralExpiresAt: Date.now() + (data.credential?.expiresIn || 7200) * 1000,
    })
    coral = nso
  }
  coralCache.set(userId, coral)

  coral.onTokenExpired = async () => {
    try {
      const partial = await coral.renewToken(auth.sessionToken, readAuth(userId).coral?.user)
      const merged = { ...readAuth(userId).coral, ...partial }
      writeAuth(userId, {
        coral: merged,
        coralExpiresAt: Date.now() + (partial.credential?.expiresIn || 7200) * 1000,
      })
      return partial
    } catch {
      coralCache.delete(userId)
      return null
    }
  }
  return coral
}

function normalizeGame(game) {
  if (!game || !game.name) return null
  return {
    name: game.name,
    imageUri: game.imageUri || '',
    shopUri: game.shopUri || '',
    totalPlayTime: game.totalPlayTime || 0,
  }
}

function friendlyError(err) {
  const msg = String(err?.message || err)
  const detail = String(err?.data?.error || err?.data?.error_message || err?.data?.error_description || '')
  if (/\[na\] Non-200|session token is invalid|invalid session token/i.test(msg)) {
    return { message: 'Nintendo 会话已失效，请在「用户设置 → 活动集成」中重新绑定账户', code: 'reauth' }
  }
  if (/incompatible_client/i.test(detail) || /incompatible_client|coral version/i.test(msg)) {
    return {
      message:
        'nxapi 使用的 NSO 版本与所选服务不兼容。请管理员在「活动集成」保存后稍等片刻，再刷新重试。',
      code: 'update',
    }
  }
  if (/oauth-protected-resource|well-known|authorisation server|protected resource/i.test(msg)) {
    return {
      message: 'nxapi 官方代理的客户端认证（OAuth 发现）接口暂时不可用（HTTP 503），请稍后重试，或先切换为 imink。',
      code: 'fgen',
    }
  }
  if (/prevents imink|prevents flapg/i.test(msg)) {
    return { message: '当前 nxapi 配置禁用了所选的 f 参数生成服务，请管理员在「活动集成」选择可用的提供商后重试', code: 'fgen' }
  }
  if (/Missing request authorisation|unauthori[sz]ed|missing.*client|\b401\b/i.test(msg)) {
    return {
      message:
        'nxapi 代理需要客户端身份。请管理员在「用户设置 → 活动集成 → Nintendo」填入注册的 client id/secret。',
      code: 'clientsetup',
    }
  }
  if (/\[imink\]|\[flapg\]|\[znca-api\]|znca api|client authentication|status code 503/i.test(msg)) {
    return {
      message:
        'f 参数生成服务拒绝了请求' + (detail ? `（${detail}）` : '') + '。请管理员确认代理地址 / Client ID / f 参数生成方式。',
      code: 'fgen',
    }
  }
  if (/9404|token expired/i.test(msg)) {
    return { message: 'Nintendo 登录已过期，正在重新验证；若持续失败请重新绑定', code: 'reauth' }
  }
  if (/update required|nxapi update/i.test(msg)) {
    return { message: 'nxapi 需要更新以匹配当前 Nintendo 版本，请运行 npm i nxapi@latest', code: 'update' }
  }
  return { message: msg, code: 'error' }
}

export async function getNintendoActivity({ force = false, userId = primaryUserId() } = {}) {
  if (!isLinked(userId)) return { configured: false }

  const cached = activityCache.get(userId)
  if (!force && cached && Date.now() - cached.at < CACHE_TTL) return cached.value

  try {
    const coral = await getCoral(userId)
    const me = (await coral.getCurrentUser()).result

    const user = {
      nsaId: me.nsaId,
      name: me.name,
      imageUri: me.imageUri,
      friendCode: me.links?.friendCode?.id || '',
      membershipActive: Boolean(me.links?.nintendoAccount?.membership?.active),
    }

    let recentGames = []
    try {
      const log = (await coral.getPlayLog(me.nsaId)).result || []
      recentGames = log.map((g) => normalizeGame(g)).filter(Boolean)
    } catch {
      recentGames = []
    }
    const recent = recentGames[0] || null
    const ownGame = normalizeGame(me.presence?.game)
    const nowPlaying = ownGame ? { source: 'self', game: ownGame, user: user.name } : null

    const value = {
      configured: true,
      ok: true,
      linked: true,
      user,
      friendCode: user.friendCode,
      recent,
      recentGames: recentGames.slice(0, 20),
      nowPlaying,
    }
    activityCache.set(userId, { at: Date.now(), value })
    writeAuth(userId, { user })
    return value
  } catch (err) {
    console.warn(
      '[nintendo] activity error:',
      String(err?.message || err),
      err?.data ? JSON.stringify(err.data) : '',
      err?.response?.status ? `status=${err.response.status}` : '',
    )
    const { message, code } = friendlyError(err)
    if (code === 'reauth') coralCache.delete(userId)
    return {
      configured: true,
      ok: false,
      linked: true,
      error: message,
      errorCode: code,
      user: readAuth(userId).user || null,
    }
  }
}
