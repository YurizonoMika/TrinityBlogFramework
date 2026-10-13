// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DATA_DIR, getSetting, setSetting } from './db.js'

/*
 * nxapi selects a Coral "f" generation provider from its runtime config.
 *
 *  - The remote config (fancy.org.uk) now returns `coral: null`, which disables
 *    direct Coral authentication entirely.
 *  - The bundled config enables Coral but pins an old NSO app version (2.4.0),
 *    while the free imink service currently supports a newer version.
 *
 * We therefore generate a small local config for nxapi: it keeps Coral enabled,
 * uses the imink provider, and syncs `znca_version` with imink's /config so the
 * version we report to Nintendo matches the version imink generates `f` for.
 *
 * Override with NXAPI_CONFIG_URL, or set NXAPI_ENABLE_REMOTE_CONFIG=1 to use the
 * remote config instead.
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
let memoryCoral = null
let activityCache = null
let configPromise = null
const CACHE_TTL = 2 * 60 * 1000

let appliedEnvSignature = null

function setEnvVar(name, value) {
  if (value === undefined || value === null || value === '') delete process.env[name]
  else process.env[name] = value
}

/**
 * Apply the nxapi znca-API configuration from the site settings
 * (用户设置 → 活动集成 → Nintendo). Credentials are only read from the settings,
 * never from `.env`. Changing them invalidates cached config / Coral tokens.
 */
function applyNxapiEnv() {
  const nintendo = (getSetting('integrations', {}) || {}).nintendo || {}
  const url = String(nintendo.zncaApiUrl || '').trim()
  const id = String(nintendo.clientId || '').trim()
  const secret = String(nintendo.clientSecret || '').trim()
  const provider =
    nintendo.provider === 'imink' || nintendo.provider === 'flapg' ? nintendo.provider : ''
  const configUrl = String(nintendo.configUrl || '').trim()
  const remoteConfig = nintendo.remoteConfig === true

  const signature = `${url}|${id}|${secret}|${provider}|${configUrl}|${remoteConfig}`
  if (signature === appliedEnvSignature) return
  appliedEnvSignature = signature

  setEnvVar('ZNCA_API_URL', url)
  setEnvVar('NXAPI_ZNCA_API_CLIENT_ID', id)
  setEnvVar('NXAPI_ZNCA_API_CLIENT_SECRET', secret)
  // explicit third-party provider (empty = auto: proxy if URL set, else imink)
  setEnvVar('NXAPI_ZNCA_API', provider)

  if (configUrl) {
    // a custom nxapi config replaces the remote/bundled selection
    setEnvVar('NXAPI_CONFIG_URL', configUrl)
    delete process.env.NXAPI_ENABLE_REMOTE_CONFIG
  } else {
    delete process.env.NXAPI_CONFIG_URL
    setEnvVar('NXAPI_ENABLE_REMOTE_CONFIG', remoteConfig ? '1' : '0')
  }

  // the local nxapi config depends on the provider URL → rebuild it
  configPromise = null
  memoryCoral = null
  activityCache = null
}

/** Force a full reload of nxapi config / Coral auth (e.g. after saving settings). */
export function resetNintendoConfig() {
  appliedEnvSignature = null
  configPromise = null
  memoryCoral = null
  activityCache = null
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

async function readProviderConfig() {
  const zncaUrl = process.env.ZNCA_API_URL?.replace(/\/+$/, '')
  const provider = zncaUrl ? ['nxapi', zncaUrl] : 'imink'
  const configUrl = zncaUrl ? `${zncaUrl}/config` : IMINK_CONFIG_URL

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
    if (process.env.NXAPI_CONFIG_URL || process.env.NXAPI_ENABLE_REMOTE_CONFIG === '1') {
      return
    }

    const nxapiVersion = installedNxapiVersion()
    const info = await readProviderConfig()

    if (info && nxapiVersion) {
      const config = {
        require_version: [nxapiVersion],
        coral: { znca_version: info.version },
        coral_auth: {
          default: info.provider,
          splatnet2statink: null,
          flapg: null,
          imink: {},
        },
        moon: null,
        coral_gws_nooklink: null,
        coral_gws_splatnet3: null,
      }
      const file = join(DATA_DIR, 'nxapi-config.json')
      writeFileSync(file, JSON.stringify(config, null, 2))
      process.env.NXAPI_CONFIG_URL = pathToFileURL(file).href
      const label = Array.isArray(info.provider) ? info.provider[1] : info.provider
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

function readAuth() {
  return getSetting(AUTH_KEY, null) || {}
}

function writeAuth(patch) {
  const next = { ...readAuth(), ...patch }
  setSetting(AUTH_KEY, next)
  return next
}

export function isLinked() {
  return Boolean(readAuth().sessionToken)
}

export function authStatus() {
  const auth = readAuth()
  return {
    linked: Boolean(auth.sessionToken),
    user: auth.user || null,
    coralExpiresAt: auth.coralExpiresAt || null,
  }
}

/* ---------------- authorisation ---------------- */

const pending = new Map()

export function createAuthoriseUrl() {
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

export async function exchangeCode(input) {
  const { code, state } = parseRedirectInput(input)
  if (!code) throw new Error('未能识别 session_token_code，请粘贴完整的重定向链接')

  let entry = state ? pending.get(state) : null
  if (!entry && pending.size === 1) {
    entry = pending.values().next().value
  }
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

  pending.clear()
  memoryCoral = null
  activityCache = null
  writeAuth({ sessionToken: data.session_token, coral: null, coralExpiresAt: null, user: null })
  return { linked: true }
}

export async function unlink() {
  setSetting(AUTH_KEY, {})
  memoryCoral = null
  activityCache = null
}

/** Clear in-memory auth/cache (e.g. after importing a backup). */
export function resetCache() {
  memoryCoral = null
  activityCache = null
}

/* ---------------- coral client ---------------- */

async function getCoral() {
  applyNxapiEnv()
  const auth = readAuth()
  if (!auth.sessionToken) return null
  const { CoralApi } = await loadCoral()

  if (memoryCoral) return memoryCoral

  if (auth.coral && auth.coralExpiresAt && auth.coralExpiresAt > Date.now()) {
    memoryCoral = CoralApi.createWithSavedToken(auth.coral)
  } else {
    const { nso, data } = await CoralApi.createWithSessionToken(auth.sessionToken)
    writeAuth({
      coral: data,
      coralExpiresAt: Date.now() + (data.credential?.expiresIn || 7200) * 1000,
    })
    memoryCoral = nso
  }

  memoryCoral.onTokenExpired = async () => {
    try {
      const partial = await memoryCoral.renewToken(auth.sessionToken, readAuth().coral?.user)
      const merged = { ...readAuth().coral, ...partial }
      writeAuth({
        coral: merged,
        coralExpiresAt: Date.now() + (partial.credential?.expiresIn || 7200) * 1000,
      })
      return partial
    } catch {
      memoryCoral = null
      return null
    }
  }

  return memoryCoral
}

/* ---------------- normalisation ---------------- */

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
  if (/\[na\] Non-200|session token is invalid|invalid session token/i.test(msg)) {
    return { message: 'Nintendo 会话已失效，请在「用户设置 → 活动集成」中重新绑定账户', code: 'reauth' }
  }
  if (/Missing request authorisation|unauthori[sz]ed|missing.*client|\b401\b/i.test(msg)) {
    return {
      message:
        'nxapi 代理需要客户端身份。请在 https://nxapi-auth.fancy.org.uk/oauth/clients 注册（scope: ca:gf ca:er ca:dr），' +
        '并将 client id/secret 填入 server/.env 的 NXAPI_ZNCA_API_CLIENT_ID / NXAPI_ZNCA_API_CLIENT_SECRET。',
      code: 'clientsetup',
    }
  }
  if (/\[imink\]|\[flapg\]|znca api|client authentication|status code 503/i.test(msg)) {
    return {
      message:
        '任天堂 f 参数生成服务当前不可用（imink 的 /f 接口返回 500）。' +
        '建议改用 nxapi 官方代理：在 server/.env 设置 ZNCA_API_URL 与客户端凭据（见 server/.env.example）。',
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

export async function getNintendoActivity({ force = false } = {}) {
  if (!isLinked()) return { configured: false }

  if (!force && activityCache && Date.now() - activityCache.at < CACHE_TTL) {
    return activityCache.value
  }

  try {
    const coral = await getCoral()
    const me = (await coral.getCurrentUser()).result

    const user = {
      nsaId: me.nsaId,
      name: me.name,
      imageUri: me.imageUri,
      friendCode: me.links?.friendCode?.id || '',
      membershipActive: Boolean(me.links?.nintendoAccount?.membership?.active),
    }

    // Recently played games (ordered most-recent first by the Coral API)
    let recentGames = []
    try {
      const log = (await coral.getPlayLog(me.nsaId)).result || []
      recentGames = log.map((g) => normalizeGame(g)).filter(Boolean)
    } catch {
      recentGames = []
    }
    const recent = recentGames[0] || null

    // "Currently playing": own presence is normally not exposed by the API.
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

    activityCache = { at: Date.now(), value }
    writeAuth({ user })
    return value
  } catch (err) {
    const { message, code } = friendlyError(err)
    if (code === 'reauth') memoryCoral = null
    return {
      configured: true,
      ok: false,
      linked: true,
      error: message,
      errorCode: code,
      user: readAuth().user || null,
    }
  }
}
