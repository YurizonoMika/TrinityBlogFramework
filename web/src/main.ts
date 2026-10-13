// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { installImageFx } from './lib/imageFx'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'

createApp(App).use(router).mount('#app')
installImageFx()
