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
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
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
try {
  db.exec("ALTER TABLE posts ADD COLUMN category TEXT NOT NULL DEFAULT ''")
} catch {
  /* column already exists */
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

export function seedDefaultCards() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM cards').get()
  if (row.n > 0) return
  const insert = db.prepare(
    `INSERT INTO cards (id, type, title, config, position, width, visible)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  )
  DEFAULT_CARDS.forEach((card, index) => {
    insert.run(card.id, card.type, card.title, JSON.stringify(card.config), index, card.width)
  })
}
