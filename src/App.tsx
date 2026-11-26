import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, Gem, Menu, MessageCircle, ShieldCheck, ShoppingBag, X } from 'lucide-react'
import { AppDownload, PwaRegistration } from './app-install'
import { collections } from './catalog'
import { CollectionCard } from './collection-card'
import { ContactPage, PrivateList, PrivateListDrawer } from './concierge'
import { useBag } from './commerce/bag'
import { homeHero } from './home-media'
import { getRoute, type Route } from './routes'

const announcement = 'Bespoke Jewelry · Engraving & Gifting · US & Global Gulf Delivery'
const mainLinks = [
  { path: '/shop/', label: 'Shop All' },
  { path: '/our-craft/', label: 'Our Craft' },
  { path: '/guides/', label: 'Journal' },
  { path: '/contact/', label: 'Contact' },
]
const customerLinks = [
  { path: '/contact/', label: 'Contact' },
  { path: '/track-order/', label: 'Track Order' },
  { path: '/shipping-delivery/', label: 'Shipping & Delivery' },
  { path: '/custom-orders-final-sale/', label: 'Custom Orders & Final Sale' },
]
const houseLinks = [
  { path: '/shop/', label: 'Shop All' },
  { path: '/about/', label: 'About' },
  { path: '/our-craft/', label: 'Our Craft' },
  { path: '/guides/', label: 'Journal' },
  { path: '/app/', label: 'The Private App' },
]

function Wordmark({ footer = false }: { footer?: boolean }) {
  return (
    <a className={`wordmark${footer ? ' wordmark--footer' : ''}`} href="/" aria-label="CREST & CARAT home">
      <img src="/images/wordmark.svg" width="661" height="112" alt="CREST & CARAT, an Evercrest VIP House" />
    </a>
  )
}

function BagLink({ mobile = false, active }: { mobile?: boolean; active: boolean }) {
  const count = useBag().reduce((total, line) => total + line.quantity, 0)
  return (
    <a className={`bag-link${mobile ? ' bag-link--mobile' : ''}`} href="/bag/" aria-current={active ? 'page' : undefined}
      aria-label={`Shopping bag${count ? `, ${count} ${count === 1 ? 'piece' : 'pieces'}` : ''}`}>
      <ShoppingBag aria-hidden="true" size={21} strokeWidth={1.5} />
      {count > 0 && <span className="bag-count" aria-hidden="true">{count}</span>}
    </a>
  )
}

function Header({ path }: { path: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const masthead = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      toggle.current?.focus()
    }

    function handleOutside(event: PointerEvent) {
      if (event.target instanceof Node && !masthead.current?.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.addEventListener('pointerdown', handleOutside)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('pointerdown', handleOutside)
    }
  }, [menuOpen])

  function navLink(link: (typeof mainLinks)[number]) {
    return (
      <a key={link.path} href={link.path} aria-current={path === link.path ? 'page' : undefined}>
        {link.label}
      </a>
    )
  }

  return (
    <header className="site-header">
      <div className="announcement">{announcement}</div>
      <div className="masthead container" ref={masthead}>
        <nav className="desktop-nav desktop-nav--start" aria-label="Collections and craft">
          {mainLinks.slice(0, 2).map(navLink)}
        </nav>
        <button
          className="menu-toggle"
          type="button"
          ref={toggle}
          aria-controls="mobile-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X aria-hidden="true" size={23} /> : <Menu aria-hidden="true" size={23} />}
        </button>
        <Wordmark />
        <BagLink mobile active={path === '/bag/'} />
        <nav className="desktop-nav desktop-nav--end" aria-label="Journal and concierge">
          {mainLinks.slice(2).map(navLink)}
          <BagLink active={path === '/bag/'} />
        </nav>
        <nav className="mobile-nav" id="mobile-navigation" aria-label="Main navigation" hidden={!menuOpen}>
          {mainLinks.map(navLink)}
          <a href="/app/">The Private App</a>
        </nav>
      </div>
    </header>
  )
}

function HomePage() {
  return (
    <>
      <section className="hero" aria-labelledby="home-heading">
        <div className="hero-editorial">
          <div className="hero-copy">
            <h1 id="home-heading">
              <span>Made to Be Yours.</span>
              <span>Crafted for the Rare, Beyond Compare.</span>
              <span>A Name to Wear, A Story to Share.</span>
            </h1>
            <p className="eyebrow hero-label">PERSONALIZED FINE JEWELRY</p>
            <p className="hero-materials">Solid Gold · Sterling Silver · Platinum · Genuine Pearls · Diamonds</p>
            <a className="button hero-button" href="/shop/">Explore the Collection</a>
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
          <figcaption>Concept styling</figcaption>
        </figure>
      </section>

      <div className="house-services" aria-label="Concierge services">
        <span><Gem aria-hidden="true" /> Bespoke Personalization</span>
        <a href="/shipping-delivery/"><ShieldCheck aria-hidden="true" /> Insured US &amp; Gulf Delivery</a>
        <a href="/contact/"><MessageCircle aria-hidden="true" /> Private Client Concierge</a>
      </div>

      <section className="container home-collections" aria-labelledby="collection-heading">
        <p className="eyebrow">The Collections</p>
        <h2 id="collection-heading">An Heirloom in the Making</h2>
        <p>Explore the materials, details, and personal touches that make a piece yours.</p>
        <div className="home-collection-grid">
          {collections.filter((collection) => collection.featured).map((collection) => (
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
          <p className="eyebrow">Your Story, in Fine Detail</p>
          <h2 id="craft-heading">Begin With Something Meaningful</h2>
          <p>A name, a date, or the coordinates of a place you carry with you. Our private client concierge can help you explore materials, engraving, and a piece made for the occasion.</p>
          <a className="button button--secondary" href="/our-craft/">Discover Our Craft</a>
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
          <p>Personalized fine jewelry and jeweled objects for the occasions you’ll remember.</p>
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
        <small>© Evercrest VIP LLC. All rights reserved.</small>
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

export async function resolveRouteContent(route: Route): Promise<ReactNode> {
  switch (route.kind) {
    case 'home': return <HomePage />
    case 'shop': {
      const { ShopPage } = await import('./catalog-pages')
      return <ShopPage />
    }
    case 'collection': {
      const { CollectionPage } = await import('./catalog-pages')
      return <CollectionPage slug={route.slug ?? ''} />
    }
    case 'product': {
      const { ProductPage } = await import('./catalog-pages')
      return <ProductPage slug={route.slug ?? ''} />
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
