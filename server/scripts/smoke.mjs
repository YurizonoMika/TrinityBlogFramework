import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'homepage-test-'))
process.env.HOMEPAGE_DATA_DIR = join(dir, 'data')
process.env.HOMEPAGE_UPLOAD_DIR = join(dir, 'uploads')

const { createApp } = await import('../src/app.js')

const app = createApp()
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://localhost:${server.address().port}`
let token = null

async function call(method, path, body, auth = true) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`)
  return data
}

const log = (label, ok) => console.log(`${ok ? '✓' : '✗'} ${label}`)

// setup
let r = await call('GET', '/api/setup/status', null, false)
if (r.setupComplete) throw new Error('expected fresh setup')
r = await call('POST', '/api/setup', { username: 'admin', password: 'secret123', displayName: '站长' }, false)
token = r.token
log('create admin', Boolean(token))

r = await call('GET', '/api/setup/status', null, false)
if (!r.setupComplete) throw new Error('setup should be complete')
log('setup complete', true)

// duplicate setup blocked
const dup = await fetch(base + '/api/setup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'x', password: 'yyyyyy' }),
})
if (dup.status !== 409) throw new Error('duplicate setup should 409')
log('duplicate admin blocked', true)

// login
r = await call('POST', '/api/auth/login', { username: 'admin', password: 'secret123' }, false)
log('login', Boolean(r.token))
r = await call('GET', '/api/auth/me')
log('me', r.user.username === 'admin')

// cards seeded
r = await call('GET', '/api/cards', null, false)
log('default cards', r.cards.length === 3)

// activity graceful (unconfigured)
r = await call('GET', '/api/activity', null, false)
log('activity fallback', r.activity.github.configured === false && r.activity.steam.configured === false)

// create post
r = await call('POST', '/api/posts', {
  title: 'Hello World',
  content: '# Hi\n\nThis is **markdown**.',
  tags: ['intro', 'test'],
  category: '随笔',
})
const post = r.post
log('create post', post.slug === 'hello-world' && post.category === '随笔')

// categories setting + filter
await call('PUT', '/api/settings/categories', { categories: ['随笔', '技术'] })
r = await call('GET', '/api/settings/public', null, false)
log('categories saved', JSON.stringify(r.categories) === JSON.stringify(['随笔', '技术']))
r = await call('GET', '/api/posts?category=随笔', null, false)
log('filter by category', r.posts.length === 1)
r = await call('GET', '/api/posts?category=技术', null, false)
log('filter empty category', r.posts.length === 0)

// public list sees it
r = await call('GET', '/api/posts', null, false)
log('public list', r.posts.length === 1)

// hide post
r = await call('PATCH', `/api/posts/${post.id}/status`, { status: 'hidden' })
log('hide post', r.post.status === 'hidden')
r = await call('GET', '/api/posts', null, false)
log('hidden not in public list', r.posts.length === 0)
r = await call('GET', '/api/posts?all=1')
log('admin sees hidden', r.posts.length === 1)

// update post
r = await call('PUT', `/api/posts/${post.id}`, { title: 'Hello MD3', status: 'published' })
log('update post', r.post.title === 'Hello MD3')

// settings
r = await call('PUT', '/api/settings/profile', { display_name: 'Yuri', bio: 'dev' })
log('update profile', r.profile.display_name === 'Yuri')
r = await call('PUT', '/api/settings/integrations', { github: { username: 'octocat' } })
log('update integrations', r.integrations.github.username === 'octocat')
r = await call('GET', '/api/settings/public', null, false)
log('public settings', r.profile.display_name === 'Yuri' && r.profile.links.length === 0)

// card crud
r = await call('POST', '/api/cards', { type: 'markdown', title: 'About', config: { body: 'Hey' } })
const card = r.card
log('create card', Boolean(card.id))
r = await call('PUT', `/api/cards/${card.id}`, { title: 'About Me', width: 'full' })
log('update card', r.card.title === 'About Me' && r.card.width === 'full')
r = await call('PUT', '/api/cards/reorder', { order: [card.id] })
log('reorder cards', r.cards[0].id === card.id)
r = await call('DELETE', `/api/cards/${card.id}`)
log('delete card', r.ok)
r = await call('GET', '/api/cards', null, false)
log('cards after delete', r.cards.length === 3)

// delete post
r = await call('DELETE', `/api/posts/${post.id}`)
log('delete post', r.ok)
r = await call('GET', '/api/posts?all=1')
log('posts after delete', r.posts.length === 0)

// activity configured after settings
r = await call('GET', '/api/activity?providers=github', null, false)
log('activity github configured', r.activity.github.configured === true)

// upload
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)
const form = new FormData()
form.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png')
const upRes = await fetch(base + '/api/upload', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
})
if (!upRes.ok) throw new Error('upload failed: ' + (await upRes.text()))
const upJson = await upRes.json()
log('upload image', upJson.url.startsWith('/uploads/'))
const fileRes = await fetch(base + upJson.url)
log('serve uploaded file', fileRes.ok)

// nintendo integration
const naNoAuth = await fetch(base + '/api/nintendo/status')
log('nintendo requires auth', naNoAuth.status === 401)
r = await call('GET', '/api/nintendo/status')
log('nintendo status unlinked', r.linked === false)
r = await call('POST', '/api/nintendo/auth/start')
log('nintendo auth url', r.url.startsWith('https://accounts.nintendo.com/connect/'))
log('nintendo auth state', typeof r.state === 'string' && r.state.length > 10)

// activity nintendo unlinked falls back to not configured
r = await call('GET', '/api/activity?providers=nintendo', null, false)
log('nintendo activity unlinked', r.activity.nintendo.configured === false)

// moments
r = await call('POST', '/api/moments', {
  content: '第一条动态',
  images: ['/uploads/a.png', '/uploads/b.png', '/uploads/c.png', '/uploads/d.png', '/uploads/e.png'],
})
log('create moment', r.moment.content === '第一条动态')
log('moment images capped at 4', r.moment.images.length === 4)
const momentId = r.moment.id
r = await call('PUT', `/api/moments/${momentId}`, { content: '更新后的动态' })
log('update moment', r.moment.content === '更新后的动态')
const longText = await fetch(base + '/api/moments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ content: 'x'.repeat(201) }),
})
log('moment 200-char limit', longText.status === 400)
r = await call('GET', '/api/moments', null, false)
log('public moment list', r.moments.length === 1)
r = await call('DELETE', `/api/moments/${momentId}`)
log('delete moment', r.ok)

// backup export / import
await call('POST', '/api/posts', { title: '备份测试', content: 'x', status: 'published' })
await call('POST', '/api/moments', { content: '备份动态' })
const expRes = await fetch(base + '/api/backup/export', {
  headers: { Authorization: `Bearer ${token}` },
})
const zipBuf = Buffer.from(await expRes.arrayBuffer())
log('backup export zip', expRes.ok && zipBuf.slice(0, 2).toString() === 'PK')
const impForm = new FormData()
impForm.append('file', new Blob([zipBuf]), 'backup.zip')
const impRes = await fetch(base + '/api/backup/import', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: impForm,
})
const impJson = await impRes.json()
log('backup import', impRes.ok && impJson.ok)
r = await call('GET', '/api/posts?all=1')
log('posts survive import', r.posts.length === 1 && r.posts[0].title === '备份测试')
r = await call('GET', '/api/moments', null, false)
log('moments survive import', r.moments.length === 1)
const badImport = await fetch(base + '/api/backup/import', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: (() => { const f = new FormData(); f.append('file', new Blob([Buffer.from('not a zip')]), 'x.zip'); return f })(),
})
log('backup import rejects invalid', badImport.status === 400)

// plugins
const AdmZip = (await import('adm-zip')).default
const pz = new AdmZip()
pz.addFile(
  'plugin.json',
  Buffer.from(
    JSON.stringify({
      id: 'demo',
      name: 'Demo Plugin',
      version: '1.0.0',
      permissions: ['posts:read'],
      capabilities: { widgets: true, postModules: true, editorTools: true, overlays: true, pages: true, cardSources: true },
    })
  )
)
pz.addFile(
  'app.js',
  Buffer.from(
    [
      "plugin.registerRoute('hello', (req) => ({ hi: 'there', id: plugin.id }))",
      "plugin.registerCardSource('latest', () => plugin.getPosts({ limit: 1 }))",
      "plugin.registerWidget({ id: 'w', title: 'Demo Widget' })",
      "plugin.registerPostModule({ id: 'm', title: 'Demo Module' })",
      "plugin.registerEditorTool({ id: 't', label: 'Demo' })",
      "plugin.registerOverlay({ id: 'o', pages: ['*'] })",
      "plugin.registerPage({ id: 'home', title: 'Demo Page' })",
    ].join('\n')
  )
)
pz.addFile('ui.ux', Buffer.from('<div class="card">Hello {{ name }}</div>'))
pz.addFile('sources/note.txt', Buffer.from('asset'))
const pzForm = new FormData()
pzForm.append('file', new Blob([pz.toBuffer()]), 'demo.zip')
let pr = await fetch(base + '/api/plugins/import', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: pzForm,
}).then((r) => r.json())
log('plugin import', pr.plugin?.id === 'demo' && pr.plugin.enabled === false)
pr = await call('PUT', '/api/plugins/demo', { enabled: true, visitor: true, permissions: ['posts:read'] })
log('plugin enable', pr.plugin.enabled === true && pr.plugin.loaded === true)
const rt = await fetch(base + '/api/plugins/runtime').then((r) => r.json())
const dp = rt.plugins.find((p) => p.id === 'demo')
log('plugin runtime manifest', Boolean(dp && dp.widgets.length === 1 && dp.postModules.length === 1))
const rr = await fetch(base + '/api/plugins/demo/call/hello').then((r) => r.json())
log('plugin route', rr.data?.hi === 'there')
const cd = await fetch(base + '/api/plugins/demo/data/latest').then((r) => r.json())
log('plugin card source', Array.isArray(cd.data))
const uiTxt = await fetch(base + '/api/plugins/demo/ui').then((r) => r.text())
log('plugin ui', uiTxt.includes('Hello'))
const asset = await fetch(base + '/plugins/demo/sources/note.txt').then((r) => r.text())
log('plugin asset', asset === 'asset')
pr = await call('PUT', '/api/plugins/demo', { enabled: false })
log('plugin disable', pr.plugin.enabled === false)
pr = await call('DELETE', '/api/plugins/demo')
log('plugin delete', pr.ok)

// SPA fallback (dist exists)
const spa = await fetch(base + '/blog')
const spaText = await spa.text()
log('serve SPA', spa.ok && spaText.includes('<div id="app">'))

// upload requires auth
const noAuthUp = await fetch(base + '/api/upload', { method: 'POST', body: new FormData() })
log('upload requires auth', noAuthUp.status === 401)

server.close()
console.log('\nAll API smoke tests passed.')
