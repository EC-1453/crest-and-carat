import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { afterEach, expect, it, vi } from 'vitest'
import type { Catalog } from '../src/commerce/api'
import { loadVerifiedOffers, renderDocument, renderHeaders, renderMerchantFeed, renderRobots, renderSitemap, verifiedOffers } from '../src/entry-server'
import { getRoute } from '../src/routes'

vi.mock('../src/catalog', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/catalog')>()
  const { compileCatalog, sourceProducts } = await import('../src/catalog-source')
  const { products } = compileCatalog(sourceProducts.map((product) =>
    ['the-sovereign', 'the-monarch'].includes(product.slug) ? {
      ...product,
      approved_details: {
        description: 'Fixture: exact gold piece & engraving.',
        materials: '14K solid gold',
        dimensions: 'Fixture dimensions',
        metalPurity: '14K',
        ...(product.slug === 'the-sovereign' ? { availability: 'InStock' as const } : {}),
        image: {
          src: `/images/fixture-${product.slug}.webp`,
          width: product.image.width,
          height: product.image.height,
          alt: 'Approved exact-item fixture photograph',
          approved: true,
        },
      },
    } : product,
  ))
  return { ...original, products }
})

const productPath = '/products/the-sovereign/'
const canonical = `https://carat.evercrest.vip${productPath}`
const catalog: Catalog = {
  items: [
    {
      sku: 'FIXTURE-001',
      productSlug: 'the-sovereign',
      variantId: 'fixture-variant',
      name: 'The Sovereign',
      variantName: 'Test & Gold',
      priceCents: 31250,
      maxQuantity: 2,
      destinations: ['AE', 'US', 'GB'],
      engraving: { minLength: 1, maxLength: 12, required: true, pattern: '.*', instructions: 'Fixture only', uppercaseOnly: false },
    },
  ],
  shipping: [
    { country: 'AE', label: 'Insured Gulf Express', region: 'GULF' },
    { country: 'US', label: 'Insured US', region: 'US' },
  ],
  processors: [{ id: 'fixture', label: 'Simulated provider' }],
  termsVersion: 'fixture-v1',
}

const template = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const noAssets = { styles: [], modules: [] }
const documents: JSDOM[] = []

function parse(markup: string, contentType = 'text/html') {
  const dom = new JSDOM(markup, { contentType })
  documents.push(dom)
  return dom.window.document
}

function schema(doc: Document): unknown[] {
  return JSON.parse(doc.querySelector('script[type="application/ld+json"]')?.textContent ?? '')['@graph']
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  for (const dom of documents.splice(0)) dom.window.close()
})

it('publishes matching Product and Offer markup, visible price and Merchant XML for a simulated eligible exact item', async () => {
  const offers = verifiedOffers(catalog)
  expect(offers).toHaveLength(1)
  const doc = parse(await renderDocument(template, getRoute(productPath), [], noAssets, { offers }))
  expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(canonical)
  expect(doc.querySelector('main .catalog-price')?.textContent).toBe('$312.50 USD')
  expect(doc.querySelector('main .catalog-help')?.textContent).toBe('Test & Gold')
  expect(doc.querySelector('main form.catalog-purchase')).toBeNull()
  expect(JSON.parse(doc.querySelector('#root')?.getAttribute('data-prerendered-offer') ?? 'null')).toEqual({
    productSlug: 'the-sovereign', variantName: 'Test & Gold', priceCents: 31250,
  })
  expect(schema(doc)).toEqual(expect.arrayContaining([
    expect.objectContaining({
      '@type': 'Product', '@id': `${canonical}#product`, name: 'The Sovereign', sku: 'FIXTURE-001', url: canonical,
      image: ['https://carat.evercrest.vip/images/fixture-the-sovereign.webp'],
      additionalProperty: [{ '@type': 'PropertyValue', name: 'Metal purity', value: '14K' }],
      offers: {
        '@type': 'Offer', url: canonical, price: '312.50', priceCurrency: 'USD',
        availability: 'https://schema.org/InStock', eligibleRegion: ['AE', 'US'], seller: { '@id': 'https://carat.evercrest.vip/#organization' },
      },
    }),
  ]))
  const rss = parse(renderMerchantFeed(offers), 'application/xml')
  const namespace = 'http://base.google.com/ns/1.0'
  const field = (name: string) => rss.getElementsByTagNameNS(namespace, name)[0]?.textContent
  expect(rss.querySelectorAll('channel > item')).toHaveLength(1)
  expect(field('id')).toBe('the-sovereign')
  expect(field('title')).toBe('The Sovereign')
  expect(field('description')).toBe('Fixture: exact gold piece & engraving.')
  expect(field('link')).toBe(canonical)
  expect(field('price')).toBe('312.50 USD')
  expect(field('image_link')).toBe('https://carat.evercrest.vip/images/fixture-the-sovereign.webp')
  expect(field('availability')).toBe('in_stock')
})

it('withholds offers with missing approvals, mismatched details, missing checkout gates or ambiguous variants', async () => {
  const [item] = catalog.items
  const closedCatalogs: Catalog[] = [
    { ...catalog, processors: [] },
    { ...catalog, termsVersion: null },
    { ...catalog, shipping: [] },
    { ...catalog, items: [{ ...item, destinations: ['GB'] }] },
    { ...catalog, items: [{ ...item, priceCents: 0 }] },
    { ...catalog, items: [{ ...item, name: 'Wrong product name' }] },
    { ...catalog, items: [{ ...item, productSlug: 'the-monarch', name: 'The Monarch' }] },
    { ...catalog, items: [{ ...item, productSlug: 'the-aurelia', name: 'The Aurelia' }] },
    { ...catalog, items: [item, { ...item, sku: 'FIXTURE-002', variantId: 'other-variant' }] },
  ]
  for (const closedCatalog of closedCatalogs) expect(verifiedOffers(closedCatalog)).toEqual([])
  const doc = parse(await renderDocument(template, getRoute(productPath), [], noAssets))
  expect(schema(doc)).not.toContainEqual(expect.objectContaining({ '@type': 'Product' }))
  expect(doc.querySelector('main .catalog-price')).toBeNull()
})

it('never promotes a high jewelry design study or its indicative price to a production Offer', async () => {
  const route = getRoute('/products/the-lumiere-riviere/')
  expect(route.kind).toBe('product')
  const [item] = catalog.items
  const unverified = verifiedOffers({
    ...catalog,
    items: [{ ...item, productSlug: route.slug ?? '', name: route.label, priceCents: 1_850_000 }],
  })
  expect(unverified).toEqual([])
  const doc = parse(await renderDocument(template, route, [], noAssets, { offers: unverified }))
  expect(schema(doc)).not.toContainEqual(expect.objectContaining({ '@type': 'Product' }))
  expect(JSON.parse(doc.querySelector('#root')?.getAttribute('data-prerendered-offer') ?? 'null')).toBeNull()
  expect(parse(renderMerchantFeed(unverified), 'application/xml').querySelectorAll('channel > item')).toHaveLength(0)
})

it('requires explicit publication and rejects a nonproduction API before reading its offers', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  vi.stubGlobal('fetch', fetch)
  await expect(loadVerifiedOffers(false)).resolves.toEqual([])
  expect(fetch).not.toHaveBeenCalled()

  fetch.mockResolvedValueOnce(Response.json({ ok: true, environment: 'test' }))
  await expect(loadVerifiedOffers(true)).rejects.toThrow('production commerce Worker')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith('https://carat.evercrest.vip/api/health', expect.objectContaining({ cache: 'no-store', redirect: 'error' }))

  fetch.mockResolvedValueOnce(Response.json({ ok: true, environment: 'production' })).mockResolvedValueOnce(Response.json(catalog))
  await expect(loadVerifiedOffers(true)).resolves.toHaveLength(1)
  expect(fetch).toHaveBeenLastCalledWith('https://carat.evercrest.vip/api/catalog', expect.objectContaining({ cache: 'no-store', redirect: 'error' }))
})

it('marks preview public pages and 404 as noindex, omits offers, and allows crawling of the directive', async () => {
  vi.stubEnv('VITE_GSC_VERIFICATION', 'simulated-site-verification')
  const markup = await renderDocument(template, getRoute(productPath), [], noAssets, { preview: true, offers: verifiedOffers(catalog) })
  const preview = parse(markup)
  expect(preview.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow')
  expect(preview.querySelector('meta[name="google-site-verification"]')).toBeNull()
  expect(preview.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(canonical)
  expect(schema(preview)).not.toContainEqual(expect.objectContaining({ '@type': 'Product' }))
  expect(preview.querySelector('#root')?.hasAttribute('data-prerendered-offer')).toBe(false)

  const notFound = parse(await renderDocument(template, getRoute('/missing/'), [], noAssets, { preview: true }))
  expect(notFound.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow')
  expect(renderHeaders('/*\n  Referrer-Policy: no-referrer\n', true)).toContain('/*\n  X-Robots-Tag: noindex, nofollow\n')
  expect(renderRobots(true)).toContain('Allow: /\n')
  expect(renderRobots(true)).not.toContain('Sitemap:')
  expect(parse(renderSitemap(true), 'application/xml').querySelectorAll('url')).toHaveLength(0)
})
