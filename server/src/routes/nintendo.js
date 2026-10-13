// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { Router } from 'express'
import { requireAuth } from '../auth.js'
import {
  authStatus,
  createAuthoriseUrl,
  exchangeCode,
  getNintendoActivity,
  unlink,
} from '../nintendo.js'

const router = Router()

router.use(requireAuth)

router.get('/status', (req, res) => {
  res.json(authStatus())
})

router.post('/auth/start', (req, res) => {
  res.json(createAuthoriseUrl())
})

router.post('/auth/exchange', async (req, res) => {
  const input = req.body?.input || req.body?.code || ''
  try {
    await exchangeCode(input)
  } catch (err) {
    return res.status(400).json({ error: String(err.message || err) })
  }

  let activity = null
  try {
    activity = await getNintendoActivity({ force: true })
  } catch {
    /* linked but not reachable */
  }
  res.json({ status: authStatus(), activity })
})

router.post('/refresh', async (req, res) => {
  const activity = await getNintendoActivity({ force: true })
  res.json({ activity })
})

router.delete('/', async (req, res) => {
  await unlink()
  res.json({ ok: true })
})

export default router
