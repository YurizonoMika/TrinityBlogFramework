// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { createApp } from './app.js'
import { seedDefaultCards, isSetupComplete } from './db.js'
import { loadAllPlugins } from './plugins.js'

const PORT = Number(process.env.PORT) || 8787

if (isSetupComplete()) seedDefaultCards()
loadAllPlugins()

createApp().listen(PORT, () => {
  console.log(`\n  ✦ homepage API   http://localhost:${PORT}`)
  console.log(`  ✦ setup complete: ${isSetupComplete()}\n`)
})
