import { renderToString } from 'react-dom/server'
import { App, resolveRouteContent } from './App'
import { googlePlayUrl, iosAppStoreUrl } from './app-install'
import { BUSINESS_ADDRESS, BUSINESS_NAME, SUPPORT_EMAIL } from './business'
import { getPurchasableOffer, productPath, products } from './catalog'
import type { Product, PurchasableOffer, ShippingZone } from './catalog-types'
import { shippingFaq } from './editorial-meta'
import { homeHero } from './home-media'
import { notFoundRoute, routes, SITE_NAME, SITE_ORIGIN, type Route } from './routes'

export { notFoundRoute, routes }

const organizationId = `${SITE_ORIGIN}/#organization`
const brandId = `${SITE_ORIGIN}/#brand`
const websiteId = `${SITE_ORIGIN}/#website`
const shippingPolicyUrl = `${SITE_ORIGIN}/shipping-delivery/`
const returnPolicyUrl = `${SITE_ORIGIN}/custom-orders-final-sale/`
const socialImage = {
  src: '/images/social.jpg',
  width: 1200,
  height: 630,
  alt: 'CREST & CARAT concept styling of gold jewelry and pearls on limestone',
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

function publicOffer(product: Product): PurchasableOffer | undefined {
  return product.image.approved ? getPurchasableOffer(product) : undefined
}

function productForRoute(route: Route): Product | undefined {
  return route.kind === 'product' ? products.find(({ slug }) => slug === route.slug) : undefined
}

function businessDays(minValue: number, maxValue: number) {
  return { '@type': 'QuantitativeValue', minValue, maxValue, unitCode: 'DAY' }
}

function destinationDetails(offer: PurchasableOffer, zone: ShippingZone): SchemaNode[] {
  return zone.destinations.filter((destination) => offer.eligibleDestinations.includes(destination)).map((destination) => ({
    '@type': 'OfferShippingDetails',
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: destination },
    shippingRate: { '@type': 'MonetaryAmount', value: zone.rateUsd, currency: offer.currency },
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      handlingTime: businessDays(offer.production.minBusinessDays, offer.production.maxBusinessDays),
      transitTime: businessDays(zone.minBusinessDays, zone.maxBusinessDays),
    },
    shippingSettingsLink: shippingPolicyUrl,
  }))
}

function productSchema(product: Product, offer: PurchasableOffer): SchemaNode {
  const url = absoluteUrl(productPath(product.slug))
  const personalized = offer.surfaces.length > 0

  return {
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.name,
    url,
    description: product.description,
    image: [absoluteUrl(product.image.src)],
    material: product.materials,
    category: product.category,
    ...(offer.stone ? { additionalProperty: { '@type': 'PropertyValue', name: 'Stone', value: offer.stone.description } } : {}),
    offers: {
      '@type': 'Offer',
      url,
      seller: { '@id': organizationId },
      price: offer.priceUsd.toFixed(2),
      priceCurrency: offer.currency,
      availability: `https://schema.org/${offer.availability === 'PreOrder' ? 'PreOrder' : 'InStock'}`,
      ...(offer.availability === 'PreOrder' && offer.availabilityDate ? { availabilityStarts: offer.availabilityDate } : {}),
      shippingDetails: offer.shipping.flatMap((zone) => destinationDetails(offer, zone)),
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: offer.eligibleDestinations,
        merchantReturnLink: personalized ? returnPolicyUrl : `${SITE_ORIGIN}/terms/`,
        ...(personalized ? { returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted' } : {}),
      },
    },
  }
}

function pageSchema(route: Route): SchemaNode {
  const url = absoluteUrl(route.path)
  const guide = isGuide(route)
  const product = productForRoute(route)
  const offer = product && publicOffer(product)
  const appLinks = [iosAppStoreUrl, googlePlayUrl].filter(Boolean)
  const trailId = `${url}#breadcrumb`
  const graph: SchemaNode[] = [
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: SITE_NAME,
      legalName: BUSINESS_NAME,
      url: SITE_ORIGIN,
      logo: absoluteUrl('/images/wordmark.svg'),
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
    { '@type': 'Brand', '@id': brandId, name: SITE_NAME, url: SITE_ORIGIN, logo: absoluteUrl('/images/wordmark.svg') },
    { '@type': 'WebSite', '@id': websiteId, url: SITE_ORIGIN, name: SITE_NAME, inLanguage: 'en', publisher: { '@id': organizationId } },
    {
      '@type': route.kind === 'contact' ? 'ContactPage' : route.kind === 'shop' || route.kind === 'collection' ? 'CollectionPage' : 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: getTitle(route),
      description: route.description,
      inLanguage: 'en',
      isPartOf: { '@id': websiteId },
      ...(route.breadcrumbs.length > 1 ? { breadcrumb: { '@id': trailId } } : {}),
      ...(product && offer ? { mainEntity: { '@id': `${url}#product` } } : {}),
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

  if (product && offer) graph.push(productSchema(product, offer))

  return { '@context': 'https://schema.org', '@graph': graph }
}

function metadata(route: Route): string {
  const title = escapeMarkup(getTitle(route))
  const description = escapeMarkup(route.description)
  const url = escapeMarkup(absoluteUrl(route.path))
  const verification = import.meta.env.VITE_GSC_VERIFICATION?.trim()
  const image = route.image ?? socialImage
  const imageUrl = escapeMarkup(absoluteUrl(image.src))
  const imageAlt = escapeMarkup(image.alt)
  const tags = [`<title>${title}</title>`, `<meta name="description" content="${description}">`]

  if (route.kind === 'not-found') {
    return [...tags, '<meta name="robots" content="noindex, follow">'].join('\n    ')
  }

  tags.push(
    `<link rel="canonical" href="${url}">`,
    `<link rel="alternate" hreflang="en" href="${url}">`,
    `<link rel="alternate" hreflang="x-default" href="${url}">`,
    `<meta name="robots" content="${route.indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow'}">`,
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

  if (verification) tags.push(`<meta name="google-site-verification" content="${escapeMarkup(verification)}">`)

  const schema = JSON.stringify(pageSchema(route)).replaceAll('<', '\\u003c')
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

export async function renderDocument(template: string, route: Route, fontAssets: readonly string[], routeAssets: RouteAssets): Promise<string> {
  const head = metadata(route) + preloads(route, fontAssets, routeAssets, template)
  const content = await resolveRouteContent(route)
  const body = renderToString(<App path={route.path}>{content}</App>)
  const root = /<div id="root">\s*(?:<!--app-html-->)?\s*<\/div>/

  if (!root.test(template)) throw new Error('Vite template is missing the prerender root')

  const document = template.includes('<!--page-head-->')
    ? template.replace('<!--page-head-->', () => head)
    : template.replace('</head>', () => `    ${head}\n  </head>`)

  return document.replace(root, () => `<div id="root" data-prerendered-path="${escapeMarkup(route.path)}">${body}</div>`)
}

export function renderSitemap(): string {
  const entries = routes.filter(({ indexable }) => indexable).map(({ path }) => `  <url><loc>${escapeMarkup(absoluteUrl(path))}</loc></url>`)
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...entries, '</urlset>', ''].join('\n')
}

export function renderRobots(): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`
}

export function renderMerchantFeed(): string {
  const items = products.flatMap((product) => {
    const offer = publicOffer(product)
    if (!offer) return []

    const shipping = offer.shipping.flatMap((zone) => zone.destinations
      .filter((destination) => offer.eligibleDestinations.includes(destination))
      .map((destination) => `      <g:shipping><g:country>${escapeMarkup(destination)}</g:country><g:service>${escapeMarkup(zone.name)}</g:service><g:price>${zone.rateUsd.toFixed(2)} ${offer.currency}</g:price></g:shipping>`))

    return [
      '    <item>',
      `      <g:id>${escapeMarkup(product.slug)}</g:id>`,
      `      <g:title>${escapeMarkup(product.name)}</g:title>`,
      `      <g:description>${escapeMarkup(product.description)}</g:description>`,
      `      <g:link>${escapeMarkup(absoluteUrl(productPath(product.slug)))}</g:link>`,
      `      <g:image_link>${escapeMarkup(absoluteUrl(product.image.src))}</g:image_link>`,
      `      <g:price>${offer.priceUsd.toFixed(2)} ${offer.currency}</g:price>`,
      `      <g:availability>${offer.availability === 'PreOrder' ? 'preorder' : 'in_stock'}</g:availability>`,
      ...(offer.availability === 'PreOrder' && offer.availabilityDate ? [`      <g:availability_date>${escapeMarkup(offer.availabilityDate)}</g:availability_date>`] : []),
      `      <g:product_type>${escapeMarkup(product.category)}</g:product_type>`,
      ...shipping,
      '    </item>',
    ]
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '  <channel>',
    `    <title>${escapeMarkup(SITE_NAME)}</title>`,
    `    <link>${SITE_ORIGIN}/</link>`,
    '    <description>Verified fine jewelry and jeweled objects available to purchase.</description>',
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}
