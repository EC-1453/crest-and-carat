import { existsSync, readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { afterAll, expect, it, vi } from 'vitest'
import { notFoundRoute, routes } from '../src/routes'

const origin = 'https://carat.evercrest.vip'
const domain = (path: string) => new URL(path, origin).href
const fromDist = (path: string) => new URL(`../dist/${path}`, import.meta.url)
const readDist = (path: string) => readFileSync(fromDist(path), 'utf8')
const documents: JSDOM[] = []

function parse(markup: string, contentType = 'text/html'): Document {
  const dom = new JSDOM(markup, { contentType })
  documents.push(dom)
  return dom.window.document
}

function schemaNodes(doc: Document): string[] {
  const nodes: string[] = []
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const data: unknown = JSON.parse(script.textContent || '')
    expect(data).toMatchObject({ '@context': 'https://schema.org', '@graph': expect.any(Array) })
    for (const entry of (data as { '@graph': Record<string, unknown>[] })['@graph']) {
      expect(entry['@type']).toEqual(expect.any(String))
      expect(entry['@id']).toMatch(/^https:\/\/carat\.evercrest\.vip\//)
      nodes.push(String(entry['@type']))
      expect(entry).not.toHaveProperty('offers')
    }
  }
  return nodes
}

function fromRoute(path: string) {
  return parse(readDist(path === '/404.html' ? '404.html' : `${path.slice(1)}index.html`))
}

afterAll(() => {
  for (const dom of documents) dom.window.close()
})

it.each([...routes, notFoundRoute])('serves a complete static HTML document for $path', (route) => {
  const doc = fromRoute(route.path)
  expect(doc.doctype?.name).toBe('html')
  expect(doc.documentElement.lang).toBe('en')
  expect(doc.querySelectorAll('head > title')).toHaveLength(1)
  expect(doc.title).toContain('CREST & CARAT')
  expect(doc.querySelectorAll('meta[name="description"]')).toHaveLength(1)
  expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(route.description)
  expect(doc.querySelector('meta[name="viewport"]')?.getAttribute('content')).toContain('width=device-width')
  expect(doc.querySelector('#root')?.getAttribute('data-prerendered-path')).toBe(route.path)
  expect(doc.querySelectorAll('main')).toHaveLength(1)
  expect(doc.querySelectorAll('h1')).toHaveLength(1)
  expect(doc.querySelector('main h1')?.textContent?.trim()).not.toBe('')
  const ids = [...doc.querySelectorAll('[id]')].map(({ id }) => id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')?.split(', ')[0])
    .toBe(route.indexable ? 'index' : 'noindex')

  if (route.kind === 'not-found') {
    expect(doc.querySelector('main h1')?.textContent).toMatch(/This Page Has Moved/)
    expect(doc.querySelector('link[rel="canonical"]')).toBeNull()
    return
  }

  const url = domain(route.path)
  const canonical = doc.querySelectorAll('link[rel="canonical"]')
  expect(canonical).toHaveLength(1)
  expect(canonical[0].getAttribute('href')).toBe(url)
  const alternates = [...doc.querySelectorAll('link[rel="alternate"][hreflang]')]
  expect(alternates.map((link) => [link.getAttribute('hreflang'), link.getAttribute('href')]))
    .toEqual([['en', url], ['x-default', url]])
  expect(doc.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(url)
  expect(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(doc.title)
  expect(doc.querySelector('meta[property="og:description"]')?.getAttribute('content')).toBe(route.description)
  expect(doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content')).toBe(doc.title)
  expect(doc.querySelector('meta[name="twitter:description"]')?.getAttribute('content')).toBe(route.description)
  expect(doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image')
  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
    const image = new URL(doc.querySelector(selector)?.getAttribute('content') ?? '')
    expect(image.origin).toBe(origin)
    expect(existsSync(fromDist(image.pathname.slice(1)))).toBe(true)
  }
  const types = schemaNodes(doc)
  expect(types).toEqual(expect.arrayContaining(['Organization', 'WebSite']))
  expect(types.includes('BreadcrumbList')).toBe(route.breadcrumbs.length > 1)
  expect(types.includes('FAQPage')).toBe(route.path === '/shipping-delivery/')
  expect(types).not.toContain('Product')
  expect(types).not.toContain('Offer')
})

it('uses unique page titles and descriptions, including the static 404', () => {
  const pages = [...routes, notFoundRoute].map(({ path }) => fromRoute(path))
  expect(new Set(pages.map(({ title }) => title)).size).toBe(pages.length)
  expect(new Set(pages.map((doc) => doc.querySelector('meta[name="description"]')?.getAttribute('content'))).size)
    .toBe(pages.length)
})

it('lists only indexable canonical routes in the valid sitemap XML', () => {
  const sitemap = parse(readDist('sitemap.xml'), 'application/xml')
  expect(sitemap.documentElement.namespaceURI).toBe('http://www.sitemaps.org/schemas/sitemap/0.9')
  const listed = [...sitemap.querySelectorAll('url > loc')].map((entry) => entry.textContent)
  expect(listed).toEqual(routes.filter(({ indexable }) => indexable).map(({ path }) => domain(path)))
  expect(readDist('robots.txt')).toContain(`Sitemap: ${origin}/sitemap.xml\n`)
  expect(readDist('robots.txt')).toContain('Disallow: /api/')
})

it('excludes inquiry-only pieces from the Merchant Center feed', () => {
  expect(routes.filter(({ kind }) => kind === 'product')).toHaveLength(6)
  const feed = parse(readDist('merchant-feed.xml'), 'application/xml')
  expect(feed.documentElement.tagName).toBe('rss')
  expect(feed.documentElement.getAttribute('version')).toBe('2.0')
  expect(feed.documentElement.lookupNamespaceURI('g')).toBe('http://base.google.com/ns/1.0')
  expect(feed.querySelector('channel > link')?.textContent).toBe(`${origin}/`)
  expect(feed.querySelectorAll('channel > item')).toHaveLength(0)
})

it('lists the US, UK and all six Gulf countries with English content and a visible shipping FAQ', () => {
  const home = fromRoute('/')
  const delivery = fromRoute('/shipping-delivery/')
  const organization = JSON.parse(home.querySelector('script[type="application/ld+json"]')?.textContent ?? '')
    ['@graph'].find((node: { '@type': string }) => node['@type'] === 'Organization')
  expect(organization.areaServed.map(({ identifier }: { identifier: string }) => identifier).sort())
    .toEqual(['AE', 'BH', 'GB', 'KW', 'OM', 'QA', 'SA', 'US'])
  const copy = delivery.querySelector('main')?.textContent
  for (const country of ['United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman']) {
    expect(copy).toContain(country)
  }
  const faq = JSON.parse(delivery.querySelector('script[type="application/ld+json"]')?.textContent ?? '')
    ['@graph'].find((node: { '@type': string }) => node['@type'] === 'FAQPage')
  for (const question of faq.mainEntity) {
    expect(question).toMatchObject({ '@type': 'Question', acceptedAnswer: { '@type': 'Answer' } })
    expect(copy).toContain(question.name)
    expect(copy).toContain(question.acceptedAnswer.text)
  }
})

it('keeps private routes out of the index and retains native Pages routing', () => {
  const headers = readDist('_headers')
  for (const path of ['/preview/', '/checkout/', '/bag/', '/track-order/']) {
    const rule = headers.split(/\n\n/).find((block) => block.startsWith(`${path}*\n`))
    expect(rule).toContain('X-Robots-Tag: noindex')
    expect(rule).toContain('Cache-Control: no-store')
    expect(readDist('sitemap.xml')).not.toContain(domain(path))
  }
  expect(headers).toContain('Content-Security-Policy:')
  expect(headers).toContain('Strict-Transport-Security:')
  expect(headers).toMatch(/\/assets\/\*\n  Cache-Control: public, max-age=31536000, immutable/)
  expect(existsSync(fromDist('404.html'))).toBe(true)
  const redirects = new URL('../public/_redirects', import.meta.url)
  expect(readFileSync(redirects, 'utf8')).toContain('/* /index.html 200')
  if (existsSync(fromDist('_redirects'))) expect(readDist('_redirects')).not.toContain('/* /index.html 200')
})

it('ships an installable web manifest with matching icon dimensions and offline files', () => {
  const doc = fromRoute('/')
  expect(doc.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe('/manifest.webmanifest')
  const manifest = JSON.parse(readDist('manifest.webmanifest'))
  expect(manifest).toMatchObject({
    name: 'CREST & CARAT', id: '/', lang: 'en', start_url: '/app/', scope: '/', display: 'standalone',
  })
  expect(existsSync(fromDist('app/index.html'))).toBe(true)
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
    expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
  ]))
  for (const { src, sizes } of manifest.icons) {
    const icon = readFileSync(fromDist(src.slice(1)))
    expect(icon.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(`${icon.readUInt32BE(16)}x${icon.readUInt32BE(20)}`).toBe(sizes)
  }
  expect(parse(readDist('offline.html')).querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex')
})

interface FetchEventStub {
  request: { url: string; method: string; mode: string }
  respondWith: (response: Promise<Response>) => void
}

it('preloads the offline shell and bypasses private or cross-origin requests in the service worker', async () => {
  let install: ((event: { waitUntil: (work: Promise<unknown>) => void }) => void) | undefined
  let onFetch: ((event: FetchEventStub) => void) | undefined
  const addAll = vi.fn().mockResolvedValue(undefined)
  const offline = new Response('offline shell')
  const fetch = vi.fn().mockRejectedValue(new Error('offline'))
  runInNewContext(readDist('sw.js'), {
    self: {
      location: { origin },
      addEventListener: (name: string, listener: never) => {
        if (name === 'install') install = listener
        if (name === 'fetch') onFetch = listener
      },
    },
    URL, Response, fetch,
    caches: { open: vi.fn().mockResolvedValue({ addAll }), match: vi.fn().mockResolvedValue(offline) },
  })

  const waitUntil = vi.fn()
  expect(install).toBeTypeOf('function')
  install?.({ waitUntil })
  await waitUntil.mock.calls[0][0]
  expect(addAll).toHaveBeenCalledWith(['/offline', '/offline.css', '/icons/icon-192.png'])
  expect(onFetch).toBeTypeOf('function')
  const respondWith = vi.fn()
  for (const path of ['/preview/', '/bag/', '/checkout/', '/track-order/', '/api/track', '/contact/']) {
    onFetch?.({ request: { url: domain(path), method: 'GET', mode: 'navigate' }, respondWith })
  }
  onFetch?.({ request: { url: 'https://third-party.invalid/shop/', method: 'GET', mode: 'navigate' }, respondWith })
  onFetch?.({ request: { url: domain('/shop/'), method: 'POST', mode: 'navigate' }, respondWith })
  expect(respondWith).not.toHaveBeenCalled()
  const request = { url: domain('/shop/'), method: 'GET', mode: 'navigate' }
  onFetch?.({ request, respondWith })
  expect(fetch).toHaveBeenCalledWith(request, { cache: 'no-store' })
  await expect(respondWith.mock.calls[0][0]).resolves.toBe(offline)
})

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)?.map((value) => Number.parseInt(value, 16) / 255)
  if (!rgb || rgb.length !== 3) throw new Error('Invalid color in storefront stylesheet')
  const [red, green, blue] = rgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

it('uses WCAG AAA cocoa-on-beige contrast and protects small-screen and reduced-motion rules', () => {
  const stylesheet = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
  const styles = stylesheet('styles.css')
  const ink = /--ink:\s*(#[\da-f]{6})/iu.exec(styles)?.[1]
  const paper = /--paper:\s*(#[\da-f]{6})/iu.exec(styles)?.[1]
  expect(ink).toBe('#392d27')
  expect(paper).toBe('#f1e7d8')
  expect((luminance(paper ?? '') + 0.05) / (luminance(ink ?? '') + 0.05)).toBeGreaterThanOrEqual(7)
  expect(styles).toMatch(/\.hero\s*\{[^}]*background:\s*var\(--paper\)/u)
  const mobile = styles.split('@media (max-width: 47.99rem)')[1]?.split('@media')[0]
  expect(mobile).toMatch(/\.desktop-nav\s*\{\s*display:\s*none/u)
  expect(mobile).toMatch(/\.menu-toggle, \.bag-link--mobile\s*\{[^}]*width:\s*2\.75rem;[^}]*height:\s*2\.75rem/u)
  expect(mobile).toMatch(/\.hero\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/u)
  expect(stylesheet('catalog.css')).toMatch(/@media \(max-width: 720px\)[\s\S]*\.catalog-product\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/u)
  expect(stylesheet('commerce/commerce.css')).toMatch(/@media \(max-width: 36rem\)[\s\S]*\.commerce-fields\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/u)
  expect(stylesheet('concierge.css')).toMatch(/@media \(max-width: 440px\)[\s\S]*\.private-list__entry\s*\{\s*flex-direction:\s*column/u)
  expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration:\s*\.01ms/u)
})
