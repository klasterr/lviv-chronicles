// Performance regression guard: `npm run perf` (= vite build, then this script).
// Serves dist/ with vite preview, loads it in headless Chrome and checks hardware-independent budgets
// from scripts/perf-budget.json (draw calls per viewpoint, triangles, texture MB, bundle gzip, scene build time).
// FPS is NOT measured: headless Chrome uses software GL. Pass --json for machine-readable output, --url <u> to test a running server.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { preview } from 'vite'

const proj = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const argv = (k) => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1] }
const root = argv('--root') ?? proj // --root <dir>: measure another built copy of the project (before/after comparisons)
const CHROME = process.env.CHROME ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p))
if (!CHROME) throw new Error('Chrome not found: set CHROME=/path/to/chrome')

const gz = (f) => zlib.gzipSync(fs.readFileSync(f), { level: 9 }).length
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
const kb = (n) => +(n / 1024).toFixed(1)

// ---- static sizes (dist/ must exist: npm run build)
const dist = path.join(root, 'dist')
if (!fs.existsSync(dist)) throw new Error('dist/ missing: run npm run build first')
const files = walk(dist)
const js = files.filter((f) => f.endsWith('.js'))
const size = {
  jsKB: kb(js.reduce((a, f) => a + fs.statSync(f).size, 0)),
  jsGzipKB: kb(js.reduce((a, f) => a + gz(f), 0)),
  texKB: kb(files.filter((f) => f.includes(`${path.sep}tex${path.sep}`)).reduce((a, f) => a + fs.statSync(f).size, 0)),
  photosKB: kb(files.filter((f) => f.includes(`${path.sep}photos${path.sep}`)).reduce((a, f) => a + fs.statSync(f).size, 0)),
  cityJsonGzipKB: kb(gz(path.join(dist, 'city.json'))),
}

// ---- runtime metrics
let server, url = argv('--url')
if (!url) {
  server = await preview({ root, preview: { port: 4179, strictPort: true, open: false } })
  url = 'http://localhost:4179/'
}
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720', '--enable-precise-memory-info'],
})
const run = async (query) => {
  const p = await browser.newPage()
  await p.setViewport({ width: 1280, height: 720 })
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  await p.goto(url + query)
  await p.waitForFunction('window.game && window.perfReport', { timeout: 120000 })
  await new Promise((r) => setTimeout(r, 2000)) // let lazy assets/first frames settle
  const report = await p.evaluate('window.perfReport()')
  await p.close()
  return { ...report, errors }
}
let shadow, noshadow
// ?solo: no multiplayer, the budgets must not depend on the network
try { shadow = await run('?solo'); noshadow = await run('?noshadow&solo') } finally { await browser.close(); await server?.close() }

const r = shadow
const m = {
  'draws.spawn': r.views.spawn.draws, 'draws.avenue': r.views.avenue.draws, 'draws.townhall': r.views.townhall.draws,
  'draws.aerial': r.views.aerial.draws, 'draws.plaza': r.views.plaza.draws,
  'draws.shadowFrame.worst': Math.max(...Object.values(r.views).map((v) => v.shadowDraws)),
  'draws.noshadow.worst': Math.max(...Object.values(noshadow.views).map((v) => v.draws)),
  'tris.worst': Math.max(...Object.values(r.views).map((v) => v.tris)),
  'tris.shadowFrame.worst': Math.max(...Object.values(r.views).map((v) => v.shadowTris)),
  'tris.noshadow.worst': Math.max(...Object.values(noshadow.views).map((v) => v.tris)),
  programs: r.programs, textures: r.textures, texMB: r.texMB, geometryMB: r.geometryMB, meshes: r.meshes,
  sceneBuildMs: r.timings.propsBuilt - r.timings.assetsLoaded, readyMs: r.timings.ready, jsHeapMB: r.jsHeapMB ?? 0,
  'size.jsGzipKB': size.jsGzipKB, 'size.texKB': size.texKB, 'size.cityJsonGzipKB': size.cityJsonGzipKB,
}
const budget = JSON.parse(fs.readFileSync(path.join(proj, 'scripts', 'perf-budget.json'), 'utf8'))
let failed = 0
if (args.includes('--json')) console.log(JSON.stringify({ metrics: m, size, shadow, noshadow }, null, 1))
else {
  console.log('view (shadows on)   draws    tris  renderCpuMs   | frame that re-renders the shadow map | noshadow')
  for (const [k, v] of Object.entries(r.views)) console.log(`  ${k.padEnd(16)} ${String(v.draws).padStart(6)} ${String(v.tris).padStart(7)} ${String(v.renderCpuMs).padStart(8)}   | ${v.shadowDraws} draws, ${v.shadowTris} tris | ${noshadow.views[k].draws} draws, ${noshadow.views[k].tris} tris`)
  console.log('timings(ms)', JSON.stringify(r.timings))
}
for (const [k, v] of Object.entries(m)) {
  const max = budget[k]
  const bad = max !== undefined && v > max
  failed += bad
  if (!args.includes('--json')) console.log(`${bad ? 'FAIL' : 'ok  '} ${k.padEnd(22)} ${String(v).padStart(8)}${max !== undefined ? `  (budget ${max})` : ''}`)
}
const errs = [...r.errors, ...noshadow.errors]
if (errs.length) { console.log('FAIL page errors:\n  ' + errs.join('\n  ')); failed++ }
process.exit(failed ? 1 : 0)
