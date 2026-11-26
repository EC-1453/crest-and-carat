import { collectionPath, collections, productPath, products } from './catalog'
import { editorialPages } from './editorial-meta'

export const SITE_NAME = 'CREST & CARAT'
export const SITE_ORIGIN = 'https://carat.evercrest.vip'

export interface Breadcrumb {
  label: string
  path: string
}

interface RouteImage {
  src: string
  width: number
  height: number
  alt: string
}

export interface Route {
  path: string
  title: string
  description: string
  label: string
  kind: 'home' | 'shop' | 'collection' | 'product' | 'contact' | 'app' | 'editorial' | 'not-found'
  slug?: string
  breadcrumbs: readonly Breadcrumb[]
  indexable: boolean
  image?: RouteImage
}

const homeCrumb: Breadcrumb = { label: 'Home', path: '/' }
const shopCrumb: Breadcrumb = { label: 'Shop All', path: '/shop/' }
const guideCrumb: Breadcrumb = { label: 'Jewelry Guides', path: '/guides/' }

function interiorRoute(
  route: Omit<Route, 'breadcrumbs' | 'indexable'>,
  parents: readonly Breadcrumb[] = [],
  indexable = true,
): Route {
  return {
    ...route,
    breadcrumbs: [homeCrumb, ...parents, { label: route.label, path: route.path }],
    indexable,
  }
}

export const routes: readonly Route[] = [
  {
    path: '/',
    kind: 'home',
    label: 'Home',
    title: 'Bespoke Fine Jewelry & Gulf Delivery',
    description: 'Discover personalized fine jewelry in solid gold, sterling silver, platinum, genuine pearls and diamonds. Private gifting inquiries for the US, UK, UAE and Gulf.',
    breadcrumbs: [],
    indexable: true,
  },
  interiorRoute({
    ...shopCrumb,
    kind: 'shop',
    title: 'Shop Personalized Fine Jewelry & Jeweled Objects',
    description: 'Explore gold name necklaces, pearl keepsakes, diamond pendants, monogram rings and jeweled objects. Ask the private concierge about a piece or collection.',
  }),
  ...collections.map((collection) => interiorRoute({
    path: collectionPath(collection.slug),
    kind: 'collection',
    slug: collection.slug,
    label: collection.name,
    title: collection.seoTitle,
    description: collection.description,
    image: collection.image,
  }, [shopCrumb], products.some((product) => product.collections.includes(collection.slug)))),
  ...products.map((product) => {
    const collection = collections.find((item) => item.slug === product.collections[0])
    const parents = collection
      ? [shopCrumb, { label: collection.name, path: collectionPath(collection.slug) }]
      : [shopCrumb]
    return interiorRoute({
      path: productPath(product.slug),
      kind: 'product',
      slug: product.slug,
      label: product.name,
      title: product.seoTitle,
      description: product.description,
      image: product.image.approved ? product.image : undefined,
    }, parents)
  }),
  interiorRoute({
    path: '/contact/',
    kind: 'contact',
    label: 'Contact',
    title: 'Private Jewelry Concierge & Contact',
    description: 'Contact our private concierge about bespoke engraving, fine jewelry gifts, a specific piece or insured delivery in the US and internationally.',
  }),
  interiorRoute({
    path: '/app/',
    kind: 'app',
    label: 'The Private App',
    title: 'Install the Private Fine Jewelry App',
    description: 'Add the Crest & Carat Private App to your phone or desktop to return to the collection, jewelry guides and private concierge.',
  }),
  ...editorialPages.map((page) => interiorRoute(
    { ...page, kind: 'editorial' },
    page.path.startsWith('/guides/') && page.path !== guideCrumb.path ? [guideCrumb] : [],
  )),
]

export const notFoundRoute = interiorRoute({
  path: '/404.html',
  kind: 'not-found',
  label: 'Page unavailable',
  title: 'Page Unavailable',
  description: 'Browse the Crest & Carat collections or reach our private concierge.',
}, [], false)

const routesByPath = new Map(routes.map((route) => [route.path, route]))

export function normalizePath(input: string): string {
  const [pathname = '/'] = input.split(/[?#]/, 1)
  const path = `/${pathname.replace(/^\/+|\/+$/g, '')}`

  if (path === '/' || path === '/404.html') return path
  if (path.endsWith('/index.html')) return path.slice(0, -'index.html'.length)

  return `${path}/`
}

export function getRoute(path: string): Route {
  return routesByPath.get(normalizePath(path)) ?? notFoundRoute
}
