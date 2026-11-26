import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  notFoundRoute,
  renderDocument,
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
const fonts = assets.filter((file) => file.endsWith('.woff2')).map((file) => `/assets/${file}`)
const allRoutes = [...routes, notFoundRoute]
const paths = new Set()
const routeModules = {
  shop: 'src/catalog-pages.tsx',
  collection: 'src/catalog-pages.tsx',
  product: 'src/catalog-pages.tsx',
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

  const document = await renderDocument(template, route, fonts, routeAssets(route.kind))
  const headings = document.match(/<h1(?:\s|>)/gi) ?? []
  if (headings.length !== 1) throw new Error(`${route.path} has ${headings.length} H1 headings. Expected one.`)

  const destination = route.kind === 'not-found'
    ? join(output, '404.html')
    : join(output, route.path.slice(1), 'index.html')

  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, document)
}

await Promise.all([
  writeFile(join(output, 'sitemap.xml'), renderSitemap()),
  writeFile(join(output, 'robots.txt'), renderRobots()),
  writeFile(join(output, 'merchant-feed.xml'), renderMerchantFeed()),
  rm(manifestPath),
])

console.log(`Prerendered ${routes.length} HTML routes and a static 404; generated sitemap, robots and Merchant Center feed.`)
