import { createRoot, hydrateRoot } from 'react-dom/client'
import { App, resolveRouteContent, UnavailablePage } from './App'
import type { PrerenderedOffer } from './catalog-types'
import { record } from './commerce/http'
import { getRoute, normalizePath } from './routes'
import './styles.css'

function readPrerenderedOffer(value: string | undefined, slug: string | undefined): PrerenderedOffer | undefined {
  if (!value || !slug) return
  try {
    const offer: unknown = JSON.parse(value)
    if (record(offer) && offer.productSlug === slug && typeof offer.variantName === 'string'
      && typeof offer.priceCents === 'number' && Number.isSafeInteger(offer.priceCents) && offer.priceCents > 0) {
      return { productSlug: slug, variantName: offer.variantName, priceCents: offer.priceCents }
    }
  } catch {
    // The live catalog is still available if optional prerendered data is malformed.
  }
}

const root = document.getElementById('root')

if (root) {
  const path = normalizePath(window.location.pathname)
  const route = getRoute(path)
  const hasStaticContent = root.dataset.prerenderedPath === route.path

  const offer = hasStaticContent ? readPrerenderedOffer(root.dataset.prerenderedOffer, route.slug) : undefined

  void resolveRouteContent(route, offer).then((content) => {
    const view = <App path={path}>{content}</App>
    if (hasStaticContent) hydrateRoot(root, view)
    else createRoot(root).render(view)
  }).catch(() => {
    if (!hasStaticContent) {
      createRoot(root).render(<App path={path}><UnavailablePage /></App>)
    }
  })
}
