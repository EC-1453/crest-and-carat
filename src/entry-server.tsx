import { renderToString } from 'react-dom/server'
import { App, resolveRouteContent } from './App'
import { googlePlayUrl, iosAppStoreUrl } from './app-install'
import { WORDMARK_PATH } from './brand'
import { BUSINESS_ADDRESS, SUPPORT_EMAIL } from './business'
import { productPath, products } from './catalog'
import type { PrerenderedOffer, Product } from './catalog-types'
import { parseApiBase } from './commerce/api-base'
import { parseCatalog, purchasableItems, type Catalog, type CatalogItem } from './commerce/api'
import { record } from './commerce/http'
import { shippingFaq } from './editorial-meta'
import { homeHero } from './home-media'
import { notFoundRoute, routes, SITE_NAME, SITE_ORIGIN, type Route } from './routes'

export { notFoundRoute, routes }

const organizationId = `${SITE_ORIGIN}/#organization`
const brandId = `${SITE_ORIGIN}/#brand`
const websiteId = `${SITE_ORIGIN}/#website`
const socialImage = {
  src: '/images/high-jewelry-social.jpg',
  width: 1200,
  height: 630,
  alt: 'CREST & CARAT high jewelry design study on warm limestone',
}

const countries = {
  US: 'United States',
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  QA: 'Qatar',
  KW: 'Kuwait',
  BH: 'Bahrain',
  OM: 'Oman',
  GB: 'United Kingdom',
}

type SchemaNode = Record<string, unknown>

function absoluteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).href
}

function escapeMarkup(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getTitle(route: Route): string {
  return route.title.includes(SITE_NAME) ? route.title : `${route.title} | ${SITE_NAME}`
}

function isGuide(route: Route): boolean {
  return route.kind === 'editorial' && route.path.startsWith('/guides/') && route.path !== '/guides/'
}

interface VerifiedOffer {
  product: Product
  item: CatalogItem
  destinations: readonly string[]
}

export function verifiedOffers(catalog: Catalog): readonly VerifiedOffer[] {
  const shippingCountries = new Set(catalog.shipping.map(({ country }) => country))
  return products.flatMap((product) => {
    if (!product.image.approved || product.verifiedDetails?.availability !== 'InStock') return []
    const items = purchasableItems(catalog, product.slug)
    // This page has one canonical item URL and one approved image set. Publish when it represents a single exact variant.
    const [item] = items
    if (items.length !== 1 || item.name !== product.name) return []
    return [{ product, item, destinations: item.destinations.filter((country) => shippingCountries.has(country)) }]
  })
}

export async function loadVerifiedOffers(enabled: boolean): Promise<readonly VerifiedOffer[]> {
  if (!enabled) return []

  async function read(path: '/api/health' | '/api/catalog'): Promise<unknown> {
    const response = await fetch(absoluteUrl(path), {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      throw new Error(`The production Worker did not return catalog verification data from ${path}.`)
    }
    return response.json()
  }

  const health = await read('/api/health')
  if (!record(health) || health.ok !== true || health.environment !== 'production') {
    throw new Error('Offer publication requires the production commerce Worker.')
  }
  return verifiedOffers(parseCatalog(await read('/api/catalog')))
}

function offerPrice(item: CatalogItem): string {
  return (item.priceCents / 100).toFixed(2)
}

function productSchema({ product, item, destinations }: VerifiedOffer): SchemaNode {
  const url = absoluteUrl(productPath(product.slug))
  const details = product.verifiedDetails
  const stone = details?.stone
  const additionalProperty = [
    ['Metal purity', details?.metalPurity],
    ['Stone', stone?.description],
    ['Carat weight', stone && 'caratWeight' in stone ? `${stone.caratWeight} ct` : undefined],
    ['Origin', stone && 'origin' in stone ? stone.origin : undefined],
    ['Geographical origin', stone && 'geographicalOrigin' in stone ? stone.geographicalOrigin : undefined],
    ['Color grade', stone && 'colorGrade' in stone ? stone.colorGrade : undefined],
    ['Clarity grade', stone && 'clarityGrade' in stone ? stone.clarityGrade : undefined],
  ].flatMap(([name, value]) => value ? [{ '@type': 'PropertyValue', name, value }] : [])
  return {
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.name,
    url,
    description: product.description,
    image: [absoluteUrl(product.image.src)],
    material: product.materials,
    category: product.category,
    brand: { '@id': brandId },
    sku: item.sku,
    ...(additionalProperty.length ? { additionalProperty } : {}),
    offers: {
      '@type': 'Offer',
      url,
      price: offerPrice(item),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      eligibleRegion: destinations,
      seller: { '@id': organizationId },
    },
  }
}

function pageSchema(route: Route, offer: VerifiedOffer | undefined): SchemaNode {
  const url = absoluteUrl(route.path)
  const guide = isGuide(route)
  const appLinks = [iosAppStoreUrl, googlePlayUrl].filter(Boolean)
  const trailId = `${url}#breadcrumb`
  const collectionPage = route.kind === 'shop' || route.kind === 'high-jewelry' || route.kind === 'collection'
  const highJewelryList = route.kind === 'high-jewelry' ? `${url}#pieces` : undefined
  const graph: SchemaNode[] = [
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: SITE_NAME,
      url: SITE_ORIGIN,
      logo: absoluteUrl(WORDMARK_PATH),
      email: SUPPORT_EMAIL,
      ...(BUSINESS_ADDRESS ? { address: BUSINESS_ADDRESS } : {}),
      brand: { '@id': brandId },
      areaServed: Object.entries(countries).map(([identifier, name]) => ({ '@type': 'Country', name, identifier })),
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'Private client concierge',
        email: SUPPORT_EMAIL,
        availableLanguage: 'English',
        url: absoluteUrl('/contact/'),
      },
    },
    { '@type': 'Brand', '@id': brandId, name: SITE_NAME, url: SITE_ORIGIN, logo: absoluteUrl(WORDMARK_PATH) },
    { '@type': 'WebSite', '@id': websiteId, url: SITE_ORIGIN, name: SITE_NAME, inLanguage: 'en', publisher: { '@id': organizationId } },
    {
      '@type': route.kind === 'contact' ? 'ContactPage' : collectionPage ? 'CollectionPage' : 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: getTitle(route),
      description: route.description,
      inLanguage: 'en',
      isPartOf: { '@id': websiteId },
      ...(route.breadcrumbs.length > 1 ? { breadcrumb: { '@id': trailId } } : {}),
      ...(highJewelryList ? { mainEntity: { '@id': highJewelryList } } : {}),
      ...(offer ? { mainEntity: { '@id': `${url}#product` } } : {}),
    },
  ]

  if (route.breadcrumbs.length > 1) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': trailId,
      itemListElement: route.breadcrumbs.map(({ label, path }, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: label,
        item: absoluteUrl(path),
      })),
    })
  }

  if (highJewelryList) {
    const pieces = products.filter((product) => product.tier === 'high-jewelry')
    graph.push({
      '@type': 'ItemList',
      '@id': highJewelryList,
      name: route.label,
      itemListElement: pieces.map(({ name, slug }, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name,
        url: absoluteUrl(productPath(slug)),
      })),
    })
  }

  if (guide) {
    graph.push({
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: route.title,
      description: route.description,
      inLanguage: 'en',
      mainEntityOfPage: { '@id': `${url}#webpage` },
      author: { '@id': organizationId },
      publisher: { '@id': organizationId },
    })
  }

  if (route.path === '/shipping-delivery/') {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      url,
      mainEntity: shippingFaq.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    })
  }

  if (route.kind === 'app') {
    graph.push({
      '@type': 'SoftwareApplication',
      '@id': `${url}#app`,
      name: 'The Crest & Carat Private App',
      url,
      description: route.description,
      applicationCategory: 'ShoppingApplication',
      operatingSystem: 'iOS, Android and desktop browsers with progressive web app support',
      installUrl: url,
      ...(appLinks.length ? { downloadUrl: appLinks } : {}),
      publisher: { '@id': organizationId },
    })
  }

  if (offer) graph.push(productSchema(offer))

  return { '@context': 'https://schema.org', '@graph': graph }
}

function metadata(route: Route, preview: boolean, offer: VerifiedOffer | undefined): string {
  const title = escapeMarkup(getTitle(route))
  const description = escapeMarkup(route.description)
  const url = escapeMarkup(absoluteUrl(route.path))
  const verification = import.meta.env.VITE_GSC_VERIFICATION?.trim()
  const image = route.image ?? socialImage
  const imageUrl = escapeMarkup(absoluteUrl(image.src))
  const imageAlt = escapeMarkup(image.alt)
  const tags = [`<title>${title}</title>`, `<meta name="description" content="${description}">`]
  const robots = preview ? 'noindex, nofollow' : route.indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow'

  if (route.kind === 'not-found') {
    return [...tags, `<meta name="robots" content="${robots}">`].join('\n    ')
  }

  tags.push(
    `<link rel="canonical" href="${url}">`,
    `<link rel="alternate" hreflang="en" href="${url}">`,
    `<link rel="alternate" hreflang="x-default" href="${url}">`,
    `<meta name="robots" content="${robots}">`,
    `<meta property="og:type" content="${isGuide(route) ? 'article' : 'website'}">`,
    `<meta property="og:site_name" content="${escapeMarkup(SITE_NAME)}">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${imageUrl}">`,
    `<meta property="og:image:width" content="${image.width}">`,
    `<meta property="og:image:height" content="${image.height}">`,
    `<meta property="og:image:alt" content="${imageAlt}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${imageUrl}">`,
    `<meta name="twitter:image:alt" content="${imageAlt}">`,
  )

  if (verification && !preview) tags.push(`<meta name="google-site-verification" content="${escapeMarkup(verification)}">`)

  const schema = JSON.stringify(pageSchema(route, offer)).replaceAll('<', '\\u003c')
  tags.push(`<script type="application/ld+json">${schema}</script>`)
  return tags.join('\n    ')
}

interface RouteAssets {
  styles: readonly string[]
  modules: readonly string[]
}

function preloads(route: Route, fontAssets: readonly string[], routeAssets: RouteAssets, template: string): string {
  const displayWeight = route.kind === 'home' ? 'italic' : 'normal'
  const preloadFonts = fontAssets.filter((path) => path.includes('inter-latin-wght-normal-')
    || path.includes(`cormorant-garamond-latin-wght-${displayWeight}-`))
  const tags = preloadFonts.map((path) => `<link rel="preload" as="font" type="font/woff2" href="${escapeMarkup(path)}" crossorigin>`)

  if (route.kind === 'home') {
    tags.push(`<link rel="preload" as="image" type="image/avif" imagesrcset="${escapeMarkup(homeHero.avif)}" imagesizes="${escapeMarkup(homeHero.sizes)}" fetchpriority="high">`)
  }

  for (const path of routeAssets.styles) {
    if (!template.includes(`href="${path}"`)) tags.push(`<link rel="stylesheet" href="${escapeMarkup(path)}" crossorigin>`)
  }

  for (const path of routeAssets.modules) {
    if (!template.includes(`href="${path}"`) && !template.includes(`src="${path}"`)) {
      tags.push(`<link rel="modulepreload" href="${escapeMarkup(path)}" crossorigin>`)
    }
  }

  return tags.length ? `\n    ${tags.join('\n    ')}` : ''
}

export async function renderDocument(
  template: string,
  route: Route,
  fontAssets: readonly string[],
  routeAssets: RouteAssets,
  { preview = false, offers = [] }: { preview?: boolean; offers?: readonly VerifiedOffer[] } = {},
): Promise<string> {
  const offer = !preview && route.kind === 'product' ? offers.find(({ product }) => product.slug === route.slug) : undefined
  const head = metadata(route, preview, offer) + preloads(route, fontAssets, routeAssets, template)
  const item = offer?.item
  const prerenderedOffer: PrerenderedOffer | undefined = item && {
    productSlug: item.productSlug, variantName: item.variantName, priceCents: item.priceCents,
  }
  const content = await resolveRouteContent(route, prerenderedOffer)
  const body = renderToString(<App path={route.path}>{content}</App>)
  const root = /<div id="root">\s*(?:<!--app-html-->)?\s*<\/div>/

  if (!root.test(template)) throw new Error('Vite template is missing the prerender root')

  const document = template.includes('<!--page-head-->')
    ? template.replace('<!--page-head-->', () => head)
    : template.replace('</head>', () => `    ${head}\n  </head>`)

  const offerAttribute = prerenderedOffer ? ` data-prerendered-offer="${escapeMarkup(JSON.stringify(prerenderedOffer))}"` : ''
  return document.replace(root, () => `<div id="root" data-prerendered-path="${escapeMarkup(route.path)}"${offerAttribute}>${body}</div>`)
}

export function renderSitemap(preview = false): string {
  const entries = preview ? [] : routes.filter(({ indexable }) => indexable).map(({ path }) => `  <url><loc>${escapeMarkup(absoluteUrl(path))}</loc></url>`)
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...entries, '</urlset>', ''].join('\n')
}

export function renderRobots(preview = false): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n${preview ? '' : `Sitemap: ${SITE_ORIGIN}/sitemap.xml\n`}`
}

export function renderMerchantFeed(offers: readonly VerifiedOffer[] = []): string {
  const items = offers.flatMap(({ product, item }) => [
    '    <item>',
    `      <g:id>${escapeMarkup(product.slug)}</g:id>`,
    `      <g:title>${escapeMarkup(product.name)}</g:title>`,
    `      <g:description>${escapeMarkup(product.description)}</g:description>`,
    `      <g:link>${escapeMarkup(absoluteUrl(productPath(product.slug)))}</g:link>`,
    `      <g:image_link>${escapeMarkup(absoluteUrl(product.image.src))}</g:image_link>`,
    `      <g:price>${offerPrice(item)} USD</g:price>`,
    '      <g:availability>in_stock</g:availability>',
    '      <g:condition>new</g:condition>',
    `      <g:brand>${escapeMarkup(SITE_NAME)}</g:brand>`,
    '    </item>',
  ])
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '  <channel>',
    `    <title>${escapeMarkup(SITE_NAME)}</title>`,
    `    <link>${SITE_ORIGIN}/</link>`,
    '    <description>Verified high jewelry, fine jewelry and jeweled objects available to purchase.</description>',
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}

export function renderHeaders(template: string, preview = false): string {
  const apiOrigin = parseApiBase(import.meta.env.VITE_API_BASE_URL)?.origin
  const headers = apiOrigin ? template.replace("connect-src 'self';", `connect-src 'self' ${apiOrigin};`) : template
  return preview ? headers.replace('/*\n', '/*\n  X-Robots-Tag: noindex, nofollow\n') : headers
}
