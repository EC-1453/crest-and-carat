import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadVerifiedOffers,
  notFoundRoute,
  renderDocument,
  renderHeaders,
  renderMerchantFeed,
  renderRobots,
  renderSitemap,
  routes,
} from '../.ssg/entry-server.js'

const output = fileURLToPath(new URL('../dist/', import.meta.url))
const manifestPath = join(output, '.vite', 'manifest.json')
const [template, assets, manifestText] = await Promise.all([
  readFile(join(output, 'index.html'), 'utf8'),
  readdir(join(output, 'assets')),
  readFile(manifestPath, 'utf8'),
])
const manifest = JSON.parse(manifestText)
const preview = process.env.CF_PAGES === '1' && Boolean(process.env.CF_PAGES_BRANCH) && process.env.CF_PAGES_BRANCH !== 'main'
const offers = await loadVerifiedOffers(!preview && process.env.CARAT_PUBLISH_VERIFIED_OFFERS === '1')
const fonts = assets.filter((file) => file.endsWith('.woff2')).map((file) => `/assets/${file}`)
const allRoutes = [...routes, notFoundRoute]
const paths = new Set()
const routeModules = {
  shop: 'src/catalog-pages.tsx',
  'high-jewelry': 'src/catalog-pages.tsx',
  collection: 'src/catalog-pages.tsx',
  product: 'src/catalog-pages.tsx',
  bag: 'src/commerce/bag-page.tsx',
  editorial: 'src/editorial.tsx',
}

function routeAssets(kind) {
  const moduleName = routeModules[kind]
  const styles = new Set()
  const modules = new Set()
  const visited = new Set()

  function visit(name) {
    if (visited.has(name)) return
    visited.add(name)

    const chunk = manifest[name]
    if (!chunk) throw new Error(`Vite build is missing route asset ${name}`)

    for (const dependency of chunk.imports ?? []) visit(dependency)
    for (const css of chunk.css ?? []) styles.add(`/${css}`)
    if (!chunk.isEntry) modules.add(`/${chunk.file}`)
  }

  if (moduleName) visit(moduleName)
  return { styles: [...styles], modules: [...modules] }
}

for (const route of allRoutes) {
  if (paths.has(route.path)) throw new Error(`Duplicate public route: ${route.path}`)
  paths.add(route.path)

  const document = await renderDocument(template, route, fonts, routeAssets(route.kind), { preview, offers })
  const headings = document.match(/<h1(?:\s|>)/gi) ?? []
  if (headings.length !== 1) throw new Error(`${route.path} has ${headings.length} H1 headings. Expected one.`)

  const destination = route.kind === 'not-found'
    ? join(output, '404.html')
    : join(output, route.path.slice(1), 'index.html')

  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, document)
}

await Promise.all([
  writeFile(join(output, 'sitemap.xml'), renderSitemap(preview)),
  writeFile(join(output, 'robots.txt'), renderRobots(preview)),
  writeFile(join(output, 'merchant-feed.xml'), renderMerchantFeed(offers)),
  writeFile(join(output, '_headers'), renderHeaders(await readFile(join(output, '_headers'), 'utf8'), preview)),
  removeSpaFallback(),
  rm(manifestPath),
])

async function removeSpaFallback() {
  const path = join(output, '_redirects')
  const contents = await readFile(path, 'utf8')
  const rules = contents.split(/\r?\n/).filter((line) => line.trim() !== '/* /index.html 200')
  if (rules.some((line) => line.trim() && !line.trimStart().startsWith('#'))) await writeFile(path, rules.join('\n'))
  else await rm(path)
}

console.log(`Prerendered ${routes.length} HTML routes and a static 404; generated sitemap, robots and Merchant Center feed.`)
