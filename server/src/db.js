// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = process.env.HOMEPAGE_DATA_DIR || join(__dirname, '..', 'data')
export const UPLOAD_DIR = process.env.HOMEPAGE_UPLOAD_DIR || join(__dirname, '..', 'uploads')

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(UPLOAD_DIR, { recursive: true })

export const db = new DatabaseSync(join(DATA_DIR, 'homepage.db'))

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL DEFAULT '',
    email         TEXT NOT NULL DEFAULT '',
    avatar        TEXT NOT NULL DEFAULT '',
    bio           TEXT NOT NULL DEFAULT '',
    role          TEXT NOT NULL DEFAULT 'user',
    permissions   TEXT NOT NULL DEFAULT '{}',
    plugin_permissions TEXT NOT NULL DEFAULT '[]',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER NOT NULL,
    key     TEXT NOT NULL,
    value   TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  );

  CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    summary     TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    cover       TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '[]',
    category    TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'published',
    author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    views       INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cards (
    id          TEXT PRIMARY KEY,
    user_id     INTEGER,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    config      TEXT NOT NULL DEFAULT '{}',
    position    INTEGER NOT NULL DEFAULT 0,
    width       TEXT NOT NULL DEFAULT 'half',
    visible     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS moments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    content     TEXT NOT NULL DEFAULT '',
    images      TEXT NOT NULL DEFAULT '[]',
    author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

// migrations for databases created before a column was introduced
for (const sql of [
  "ALTER TABLE posts ADD COLUMN category TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'",
  "ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE users ADD COLUMN plugin_permissions TEXT NOT NULL DEFAULT '[]'",
  'ALTER TABLE cards ADD COLUMN user_id INTEGER',
]) {
  try {
    db.exec(sql)
  } catch {
    /* column already exists */
  }
}

// the first (site owner) account becomes the single super administrator
db.exec(
  `UPDATE users SET role = 'super'
   WHERE id = (SELECT MIN(id) FROM users)
     AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'super')`
)
// legacy cards + content belong to the admin
db.exec(
  `UPDATE cards SET user_id = (SELECT MIN(id) FROM users)
   WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users)`
)
db.exec(
  `UPDATE posts SET author_id = (SELECT MIN(id) FROM users)
   WHERE author_id IS NULL AND EXISTS (SELECT 1 FROM users)`
)
db.exec(
  `UPDATE moments SET author_id = (SELECT MIN(id) FROM users)
   WHERE author_id IS NULL AND EXISTS (SELECT 1 FROM users)`
)

migrateLegacyUserData()

/**
 * Deep-merge legacy global per-user settings (integrations / links / tags /
 * nintendo_auth) into the owner's user_settings — so nothing is stranded when a
 * database is upgraded to the multi-user layout. Safe to call repeatedly.
 */
export function migrateLegacyUserData() {
  try {
    const owner = primaryUserId()
    if (owner == null) return
    const legacyGet = (key) => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
      if (!row) return null
      try {
        return JSON.parse(row.value)
      } catch {
        return null
      }
    }
    const currentRow = (key) =>
      db.prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?').get(owner, key) || null
    const save = (key, value) =>
      db
        .prepare(
          `INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
           ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`
        )
        .run(owner, key, JSON.stringify(value))
    const parse = (row) => {
      if (!row) return null
      try {
        return JSON.parse(row.value)
      } catch {
        return null
      }
    }

    const legacyI = legacyGet('integrations')
    if (legacyI && typeof legacyI === 'object') {
      const currentI = parse(currentRow('integrations'))
      const merged = { ...(currentI && typeof currentI === 'object' ? currentI : {}) }
      let changed = currentI == null
      for (const [provider, legacyVal] of Object.entries(legacyI)) {
        const curVal = merged[provider]
        if (curVal === undefined) {
          merged[provider] = legacyVal
          changed = true
          continue
        }
        if (legacyVal && typeof legacyVal === 'object') {
          const sub = { ...legacyVal }
          for (const [field, v] of Object.entries(curVal || {})) {
            const empty = v === '' || v == null || (Array.isArray(v) && v.length === 0)
            if (!empty) sub[field] = v
          }
          if (JSON.stringify(sub) !== JSON.stringify(curVal)) {
            merged[provider] = sub
            changed = true
          }
        }
      }
      if (changed) save('integrations', merged)
    }
    for (const key of ['links', 'tags', 'categories', 'nintendo_auth']) {
      if (currentRow(key)) continue
      const value = legacyGet(key)
      if (value != null) save(key, value)
    }
  } catch {
    /* ignore */
  }
}

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  if (!row) return fallback
  try {
    return JSON.parse(row.value)
  } catch {
    return row.value
  }
}

export function setSetting(key, value) {
  const serialized = JSON.stringify(value)
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, serialized)
  return value
}

export function allSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const out = {}
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value)
    } catch {
      out[row.key] = row.value
    }
  }
  return out
}

/** Per-user settings (profile links/tags, integrations, plugin state, …). */
export function getUserSetting(userId, key, fallback = null) {
  const row = db
    .prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?')
    .get(userId, key)
  if (!row) return fallback
  try {
    return JSON.parse(row.value)
  } catch {
    return row.value
  }
}

export function setUserSetting(userId, key, value) {
  db.prepare(
    `INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`
  ).run(userId, key, JSON.stringify(value))
  return value
}

export function allUserSettings(userId) {
  const rows = db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').all(userId)
  const out = {}
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value)
    } catch {
      out[row.key] = row.value
    }
  }
  return out
}

/** The site owner's user id (first admin, else first user). */
export function primaryUserId() {
  const superAdmin = db.prepare("SELECT id FROM users WHERE role = 'super' ORDER BY id LIMIT 1").get()
  if (superAdmin) return superAdmin.id
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get()
  if (admin) return admin.id
  const first = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()
  return first ? first.id : null
}

export function isSetupComplete() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get()
  return row.n > 0
}

const DEFAULT_CARDS = [
  {
    id: 'profile',
    type: 'profile',
    title: '个人资料',
    width: 'half',
    config: {},
  },
  {
    id: 'activity',
    type: 'activity',
    title: '个人活动',
    width: 'half',
    config: { providers: ['github', 'steam', 'nintendo'] },
  },
  {
    id: 'posts',
    type: 'posts',
    title: '最新帖子',
    width: 'full',
    config: { limit: 3 },
  },
]

export function seedDefaultCards(userId = primaryUserId()) {
  if (userId == null) return
  const row = db.prepare('SELECT COUNT(*) AS n FROM cards WHERE user_id = ?').get(userId)
  if (row.n > 0) return
  const insert = db.prepare(
    `INSERT INTO cards (id, user_id, type, title, config, position, width, visible)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  )
  DEFAULT_CARDS.forEach((card, index) => {
    insert.run(`${card.id}-${userId}`, userId, card.type, card.title, JSON.stringify(card.config), index, card.width)
  })
}
