import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, ChevronRight, Gem, Menu, MessageCircle, ShieldCheck, ShoppingBag, X } from 'lucide-react'
import { AppDownload, PwaRegistration } from './app-install'
import { BRAND_NAME, COPYRIGHT_NOTICE, WORDMARK_PATH } from './brand'
import { collections } from './catalog'
import type { PrerenderedOffer } from './catalog-types'
import { CollectionCard } from './collection-card'
import { ContactPage, PrivateList, PrivateListDrawer } from './concierge'
import { useBag } from './commerce/bag'
import { homeHero } from './home-media'
import { getRoute, type Route } from './routes'

const announcement = 'Private commissions · Insured delivery inquiries for the US and Gulf'
const mainLinks = [
  { path: '/shop/', label: 'Collections' },
  { path: '/high-jewelry/', label: 'High Jewelry' },
  { path: '/guides/engraved-fine-jewelry/', label: 'Bespoke & Engraving' },
  { path: '/our-craft/', label: 'Our Craft' },
  { path: '/guides/', label: 'Journal' },
  { path: '/contact/', label: 'Private Concierge' },
]
const customerLinks = [
  { path: '/contact/', label: 'Private Concierge' },
  { path: '/track-order/', label: 'Track Order' },
  { path: '/shipping-delivery/', label: 'Shipping & Delivery' },
  { path: '/custom-orders-final-sale/', label: 'Custom Orders & Final Sale' },
]
const houseLinks = [
  { path: '/shop/', label: 'Collections' },
  { path: '/high-jewelry/', label: 'High Jewelry' },
  { path: '/about/', label: 'About' },
  { path: '/our-craft/', label: 'Our Craft' },
  { path: '/guides/', label: 'Journal' },
  { path: '/app/', label: 'The Private App' },
]

function Wordmark({ footer = false }: { footer?: boolean }) {
  return (
    <a className={`wordmark${footer ? ' wordmark--footer' : ''}`} href="/" aria-label="CREST & CARAT home">
      <img src={WORDMARK_PATH} width="661" height="100" alt={BRAND_NAME} />
    </a>
  )
}

function BagLink({ active }: { active: boolean }) {
  const count = useBag().reduce((total, line) => total + line.quantity, 0)
  return (
    <a className="bag-link" href="/bag/" aria-current={active ? 'page' : undefined}
      aria-label={`Shopping bag${count ? `, ${count} ${count === 1 ? 'piece' : 'pieces'}` : ''}`}>
      <ShoppingBag aria-hidden="true" size={21} strokeWidth={1.5} />
      {count > 0 && <span className="bag-count" aria-hidden="true">{count}</span>}
    </a>
  )
}

function Header({ path }: { path: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const header = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      toggle.current?.focus()
    }

    function handleOutside(event: PointerEvent) {
      if (event.target instanceof Node && !header.current?.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    const desktop = window.matchMedia('(min-width: 48rem)')
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    document.addEventListener('pointerdown', handleOutside)
    desktop.addEventListener('change', closeAtDesktop)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('pointerdown', handleOutside)
      desktop.removeEventListener('change', closeAtDesktop)
    }
  }, [menuOpen])

  return (
    <header className="site-header" ref={header}>
      <div className="announcement">{announcement}</div>
      <div className="masthead container">
        <button
          className="menu-toggle"
          type="button"
          ref={toggle}
          aria-controls="primary-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden="true" size={23} /> : <Menu aria-hidden="true" size={23} />}
        </button>
        <Wordmark />
        <BagLink active={path === '/bag/'} />
      </div>
      <nav className="site-nav" id="primary-navigation" aria-label="Main navigation" data-open={menuOpen}>
        {mainLinks.map(({ path: linkPath, label }) => (
          <a key={linkPath} href={linkPath} aria-current={path === linkPath ? 'page' : undefined}>{label}</a>
        ))}
      </nav>
    </header>
  )
}

function HomePage() {
  return (
    <>
      <section className="hero container" aria-labelledby="home-heading">
        <div className="hero-editorial">
          <div className="hero-copy">
            <h1 id="home-heading">High jewelry, <em>made personal.</em></h1>
            <p className="hero-materials">Explore 18K and 22K gold, natural gemstones, and fine jewelry designed for the occasions you’ll remember.</p>
            <div className="hero-actions">
              <a className="button hero-button" href="/high-jewelry/">Explore High Jewelry <ArrowRight aria-hidden="true" size={17} /></a>
              <a className="hero-text-link" href="/guides/engraved-fine-jewelry/">Bespoke &amp; Engraving</a>
            </div>
          </div>
        </div>
        <figure className="hero-showcase">
          <picture>
            <source type="image/avif" srcSet={homeHero.avif} sizes={homeHero.sizes} />
            <img
              src={homeHero.src}
              srcSet={homeHero.webp}
              sizes={homeHero.sizes}
              width={homeHero.width}
              height={homeHero.height}
              alt={homeHero.alt}
              fetchPriority="high"
            />
          </picture>
          <figcaption>High jewelry design study</figcaption>
        </figure>
      </section>

      <div className="house-services" aria-label="Concierge services">
        <a href="/guides/engraved-fine-jewelry/"><Gem aria-hidden="true" /> Bespoke Engraving &amp; Sizing</a>
        <a href="/shipping-delivery/"><ShieldCheck aria-hidden="true" /> Insured US &amp; Gulf Delivery Inquiries</a>
        <a href="/contact/"><MessageCircle aria-hidden="true" /> Private Concierge</a>
      </div>

      <section className="container home-collections" aria-labelledby="collection-heading">
        <h2 id="collection-heading">The High Jewelry Collections</h2>
        <p>Precious gold, natural diamonds, colored gemstones, and pearls. Explore the design studies and request a private dossier for your piece.</p>
        <div className="home-collection-grid">
          {collections.filter((collection) => collection.tier === 'high-jewelry').map((collection) => (
            <CollectionCard key={collection.slug} collection={collection} />
          ))}
        </div>
        <a className="button button--secondary" href="/shop/">View All Collections</a>
      </section>

      <section className="craft-feature" aria-labelledby="craft-heading">
        <figure className="craft-feature__detail">
          <picture>
            <source type="image/avif" srcSet="/images/craft-480.avif 480w, /images/craft-720.avif 720w" sizes="(min-width: 48rem) 50vw, 100vw" />
            <img src="/images/craft-720.webp" srcSet="/images/craft-480.webp 480w, /images/craft-720.webp 720w" sizes="(min-width: 48rem) 50vw, 100vw" alt="Hands polishing a gold pendant above a limestone work surface" width="720" height="540" loading="lazy" decoding="async" />
          </picture>
          <figcaption>Concept styling</figcaption>
        </figure>
        <div className="craft-feature__copy">
          <p className="eyebrow">Bespoke &amp; Engraving</p>
          <h2 id="craft-heading">Make the piece yours.</h2>
          <p>A name, a date, or the coordinates of a place you carry with you. Work with the Private Concierge to choose the materials, fit, and inscription for your piece.</p>
          <a className="button button--secondary" href="/guides/engraved-fine-jewelry/">Explore Bespoke &amp; Engraving</a>
        </div>
      </section>
    </>
  )
}

function Breadcrumbs({ route }: { route: Route }) {
  if (route.breadcrumbs.length < 2 || route.kind === 'not-found') return null
  return (
    <nav className="breadcrumbs container" aria-label="Breadcrumb">
      <ol>
        {route.breadcrumbs.map((item, index) => (
          <li key={item.path}>
            {index > 0 && <ChevronRight size={13} strokeWidth={1.4} aria-hidden="true" />}
            {index === route.breadcrumbs.length - 1
              ? <span aria-current="page">{item.label}</span>
              : <a href={item.path}>{item.label}</a>}
          </li>
        ))}
      </ol>
    </nav>
  )
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-app"><AppDownload compact /></div>
      <div className="footer-list"><PrivateList /></div>
      <div className="container footer-links">
        <div className="footer-house">
          <Wordmark footer />
          <p>An independent house for high jewelry and personalized fine jewelry.</p>
        </div>
        <nav aria-label="Client services">
          <h2>Client Services</h2>
          {customerLinks.map((link) => <a key={link.path} href={link.path}>{link.label}</a>)}
        </nav>
        <nav aria-label="The House">
          <h2>The House</h2>
          {houseLinks.map((link) => <a key={link.path} href={link.path}>{link.label}</a>)}
        </nav>
      </div>
      <div className="container footer-end">
        <small>{COPYRIGHT_NOTICE}</small>
        <div><a href="/privacy/">Privacy</a><a href="/terms/">Terms &amp; Conditions</a></div>
        <small>USD · English</small>
      </div>
    </footer>
  )
}

function NotFoundPage() {
  return (
    <section className="container system-page">
      <p className="eyebrow">Page unavailable</p>
      <h1>This Page Has Moved</h1>
      <p>Explore our collections or contact the private client concierge for help finding a piece.</p>
      <a className="button" href="/shop/">Explore the Collection</a>
    </section>
  )
}

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <UnavailablePage />
  }
}

export async function resolveRouteContent(route: Route, prerenderedOffer?: PrerenderedOffer): Promise<ReactNode> {
  switch (route.kind) {
    case 'home': return <HomePage />
    case 'shop': {
      const { ShopPage } = await import('./catalog-pages')
      return <ShopPage />
    }
    case 'high-jewelry': {
      const { HighJewelryPage } = await import('./catalog-pages')
      return <HighJewelryPage />
    }
    case 'collection': {
      const { CollectionPage } = await import('./catalog-pages')
      return <CollectionPage slug={route.slug ?? ''} />
    }
    case 'product': {
      const { ProductPage } = await import('./catalog-pages')
      return <ProductPage slug={route.slug ?? ''} prerenderedOffer={prerenderedOffer} />
    }
    case 'bag': {
      const { BagPage } = await import('./commerce/bag-page')
      return <BagPage />
    }
    case 'contact': return <ContactPage />
    case 'app': return <div className="container private-app-page"><AppDownload /></div>
    case 'editorial': {
      const { EditorialPage } = await import('./editorial')
      return <EditorialPage path={route.path} />
    }
    case 'not-found': return <NotFoundPage />
  }
}

export function UnavailablePage() {
  return (
    <section className="container system-page">
      <h1>This Page Couldn’t Load</h1>
      <p>Reload the page to try again, or contact the concierge for help.</p>
      <div className="button-row">
        <button className="button" type="button" onClick={() => window.location.reload()}>Reload Page</button>
        <a className="button button--secondary" href="/contact/">Contact the Concierge</a>
      </div>
    </section>
  )
}

export function App({ path, children }: { path: string; children: ReactNode }) {
  const route = getRoute(path)
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header path={route.path} />
      <main id="main-content" tabIndex={-1}>
        <Breadcrumbs route={route} />
        <PageBoundary key={route.path}>{children}</PageBoundary>
      </main>
      <SiteFooter />
      {route.kind === 'home' && <PrivateListDrawer />}
      <PwaRegistration />
    </>
  )
}
