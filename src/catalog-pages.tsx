import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { openCheckout } from './app-install';
import { FINAL_SALE_NOTICE } from './business';
import { apiEndpoint, submitSubscriber } from './concierge';
import { collectionPath, collections, getPurchasableOffer, productPath, products } from './catalog';
import { CatalogPhoto, CollectionCard } from './collection-card';
import type { AvailableOption, Product, PurchasableOffer, VerifiedStone } from './catalog-types';
import { engravingLength, validateSelection, type CheckoutSelection, type SelectionErrors } from './checkout-selection';

export { CatalogPhoto, CollectionCard } from './collection-card';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const countryNames: Readonly<Record<string, string>> = {
  US: 'United States', AE: 'United Arab Emirates', SA: 'Saudi Arabia', QA: 'Qatar',
  KW: 'Kuwait', BH: 'Bahrain', OM: 'Oman', GB: 'United Kingdom',
};
export function ProductCard({ product }: { product: Product }) {
  const offer = getPurchasableOffer(product);
  return (
    <article className="product-card">
      <a href={productPath(product.slug)}>
        <figure className="product-card__image">
          <CatalogPhoto image={product.image} />
          {!product.image.approved && <figcaption>Design concept</figcaption>}
        </figure>
        <h3 className="product-card__name">{product.name}</h3>
        <p className="product-card__materials">{product.materials}</p>
        <p className="product-card__price">{offer ? `${money.format(offer.priceUsd)} USD` : 'Inquire about this piece'}</p>
      </a>
    </article>
  );
}

export function ShopPage() {
  return (
    <div className="catalog-page container">
      <header className="page-intro catalog-intro">
        <p className="eyebrow">The Collections</p>
        <h1>Shop Fine Jewelry &amp; Jeweled Objects</h1>
        <p>Discover personalized fine jewelry and evening accessories in solid gold, sterling silver, platinum, genuine pearls and diamonds.</p>
      </header>
      <section className="catalog-section" aria-labelledby="shop-collections">
        <h2 id="shop-collections">Browse by Collection</h2>
        <div className="catalog-grid">{collections.map((collection) => <CollectionCard key={collection.slug} collection={collection} />)}</div>
      </section>
      <section className="catalog-section" aria-labelledby="shop-designs">
        <h2 id="shop-designs">Explore the Pieces</h2>
        <div className="catalog-grid">{products.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
      </section>
    </div>
  );
}

export function CollectionPage({ slug }: { slug: string }) {
  const collection = collections.find((item) => item.slug === slug);
  if (!collection) return <h1>Collection unavailable</h1>;
  const pieces = products.filter((product) => product.collections.includes(slug));
  const inquiryLink = `/contact/?collection=${encodeURIComponent(slug)}`;
  return (
    <div className="catalog-page container">
      <header className="catalog-lead">
        <div className="page-intro catalog-intro">
          <p className="eyebrow">The Collections</p>
          <h1>{collection.name}</h1>
          <p>{collection.description}</p>
          {!pieces.length && <a className="button" href={inquiryLink}>Speak With the Concierge</a>}
        </div>
        <figure className="catalog-feature-photo">
          <CatalogPhoto image={collection.image} sizes="(max-width: 720px) 94vw, 46vw" eager />
          {!collection.image.approved && <figcaption>Collection concept</figcaption>}
        </figure>
      </header>
      {pieces.length > 0 && (
        <section className="catalog-section" aria-labelledby="collection-pieces">
          <h2 id="collection-pieces">Explore the Pieces</h2>
          <div className="catalog-grid">{pieces.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
        </section>
      )}
      <a className="catalog-text-link" href="/shop/">Browse all collections</a>
    </div>
  );
}

function productCategory(category: Product['category']): string {
  return category === 'evening-bag' ? 'Evening bag' : `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

function stoneSummary(stone: VerifiedStone): string {
  if (stone.family === 'diamond') return `${stone.origin === 'natural' ? 'Natural diamond' : 'Lab-grown diamond'}, ${stone.caratWeight} ct. ${stone.description}`;
  if (stone.family === 'pearl') return `${stone.pearlType === 'other' ? 'Genuine' : `${stone.pearlType.charAt(0).toUpperCase()}${stone.pearlType.slice(1)}`} pearl. ${stone.description}`;
  if (stone.family === 'moissanite') return `Moissanite. ${stone.description}`;
  return stone.description;
}

function timing({ minBusinessDays, maxBusinessDays }: PurchasableOffer['production']): string {
  if (minBusinessDays === maxBusinessDays) return `${minBusinessDays} business ${minBusinessDays === 1 ? 'day' : 'days'}`;
  return `${minBusinessDays}–${maxBusinessDays} business days`;
}

function FinalSaleNotice() {
  return (
    <aside className="catalog-notice" aria-label="Custom orders and craftsmanship promise">
      <p>{FINAL_SALE_NOTICE}</p>
      <a href="/custom-orders-final-sale/#craftsmanship-and-transit-promise">Craftsmanship &amp; Transit Promise</a>
    </aside>
  );
}

interface OptionFieldProps {
  id: string;
  label: string;
  value: string;
  options: readonly AvailableOption[];
  onChange: (value: string) => void;
  error?: string | undefined;
}

function OptionField({ id, label, value, options, onChange, error }: OptionFieldProps) {
  if (!options.length) return null;
  return (
    <div className="form-field catalog-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} required
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}>
        <option value="">Select an option</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      {error && <span className="catalog-field-error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}

const emptySelection: CheckoutSelection = { sizeId: '', variantId: '', surfaceId: '', engraving: '', fontId: '', destination: '' };

function requestId(): string {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function optionLabel(items: readonly AvailableOption[], id: string): string | undefined {
  return items.find((item) => item.id === id)?.label;
}

function Detail({ term, children }: { term: string; children?: ReactNode }) {
  if (!children) return null;
  return <div><dt>{term}</dt><dd>{children}</dd></div>;
}

async function hostedCheckoutUrl(payload: object, allowedOrigin: string): Promise<string> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(apiEndpoint('/api/checkout'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', cache: 'no-store',
      body: JSON.stringify(payload), signal: controller.signal,
    });
    if (!response.ok) throw new Error('Checkout unavailable');
    const data: unknown = await response.json();
    if (typeof data !== 'object' || !data || !('url' in data) || typeof data.url !== 'string') throw new Error('Invalid checkout response');
    const url = new URL(data.url);
    if (url.protocol !== 'https:' || url.origin !== allowedOrigin || url.username || url.password) throw new Error('Unapproved checkout origin');
    return url.href;
  } finally {
    window.clearTimeout(timer);
  }
}

function PurchaseForm({ product, offer }: { product: Product; offer: PurchasableOffer }) {
  const [selection, setSelection] = useState<CheckoutSelection>(emptySelection);
  const [errors, setErrors] = useState<SelectionErrors>({});
  const [email, setEmail] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [review, setReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const attempt = useRef<{ key: string; id: string } | undefined>(undefined);
  const emailAttempt = useRef<{ key: string; id: string } | undefined>(undefined);
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const surface = offer.surfaces.find(({ id }) => id === selection.surfaceId);
  const font = surface?.fonts.find(({ id }) => id === selection.fontId);
  const zone = offer.shipping.find(({ destinations }) => destinations.includes(selection.destination));
  const inputCountryOptions = offer.eligibleDestinations.map((id) => ({ id, label: countryNames[id] ?? id }));

  useEffect(() => {
    if (review) heading.current?.focus();
  }, [review]);

  function update(field: keyof CheckoutSelection, value: string) {
    const nextSelection = { ...selection, [field]: value };
    if (field === 'surfaceId') {
      nextSelection.engraving = '';
      nextSelection.fontId = '';
    }
    setSelection(nextSelection);
    if (Object.keys(errors).length) setErrors(validateSelection(offer, nextSelection));
  }

  function reviewOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateSelection(offer, selection);
    setErrors(validation);
    setCheckoutError('');
    if (!Object.keys(validation).length) setReview(true);
  }

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setCheckoutError('');
    try {
      const payload = { productSlug: product.slug, email: email.trim(), selection, acknowledgedFinalSale: true };
      const key = JSON.stringify(payload);
      const emailKey = JSON.stringify([payload.email, marketingConsent]);
      if (attempt.current?.key !== key) attempt.current = { key, id: requestId() };
      if (emailAttempt.current?.key !== emailKey) emailAttempt.current = { key: emailKey, id: requestId() };
      const [checkout] = await Promise.allSettled([
        hostedCheckoutUrl({ ...payload, requestId: attempt.current.id }, offer.checkoutOrigin),
        submitSubscriber({ source: 'checkout', email: payload.email, marketingConsent, productSlug: product.slug, requestId: emailAttempt.current.id }),
      ]);
      if (checkout.status === 'rejected') throw checkout.reason;
      await openCheckout(checkout.value);
    } catch {
      setCheckoutError('Checkout is temporarily unavailable. Try again or contact the concierge for help.');
    } finally {
      setSubmitting(false);
      busy.current = false;
    }
  }

  if (review) {
    return (
      <form className="catalog-purchase" onSubmit={pay}>
        <h2 ref={heading} tabIndex={-1}>Review Your Piece</h2>
        <dl className="catalog-specifications">
          <Detail term="Piece">{product.name}</Detail>
          <Detail term="Size">{optionLabel(offer.sizes, selection.sizeId)}</Detail>
          <Detail term="Selected option">{optionLabel(offer.variants, selection.variantId)}</Detail>
          <Detail term="Engraving surface">{surface?.label}</Detail>
          <Detail term="Engraving">{selection.engraving}</Detail>
          <Detail term="Lettering">{font?.label}</Detail>
          <Detail term="Delivery destination">{countryNames[selection.destination] ?? selection.destination}</Detail>
          <Detail term="Piece price">{`${money.format(offer.priceUsd)} USD`}</Detail>
          {zone && <Detail term="Insured carrier delivery">{`${zone.name}, ${money.format(zone.rateUsd)} USD · ${timing(zone)}${zone.signatureRequired ? ' · Signature required' : ''}`}</Detail>}
        </dl>
        <p className="catalog-help">Any applicable taxes are shown at checkout. Customs duties may be collected separately. <a href="/shipping-delivery/">Shipping and delivery details</a></p>
        <FinalSaleNotice />
        <div className="form-field catalog-field">
          <label htmlFor="checkout-email">Order email</label>
          <input id="checkout-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <label className="catalog-opt-in">
          <input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} />
          <span>Send me collection previews and private gifting notes by email. <a href="/privacy/">Privacy</a></span>
        </label>
        <label className="catalog-opt-in">
          <input type="checkbox" required />
          <span>I have reviewed the final-sale notice and my selections.</span>
        </label>
        {checkoutError && <p className="catalog-field-error" role="alert">{checkoutError} <a href={`/contact/?piece=${encodeURIComponent(product.slug)}`}>Contact the concierge</a></p>}
        <div className="catalog-purchase__actions">
          <button className="button" type="submit" disabled={submitting}>{submitting ? 'Opening checkout…' : 'Continue to Secure Checkout'}</button>
          <button className="button button--secondary" type="button" disabled={submitting} onClick={() => setReview(false)}>Edit Selections</button>
        </div>
      </form>
    );
  }

  return (
    <form className="catalog-purchase" onSubmit={reviewOrder}>
      <h2>{offer.surfaces.length ? 'Personalize Your Piece' : 'Choose Your Details'}</h2>
      <OptionField id="piece-size" label="Size" value={selection.sizeId} options={offer.sizes} error={errors.sizeId} onChange={(value) => update('sizeId', value)} />
      <OptionField id="piece-variant" label="Product option" value={selection.variantId} options={offer.variants} error={errors.variantId} onChange={(value) => update('variantId', value)} />
      <OptionField id="piece-surface" label="Engraving surface" value={selection.surfaceId} options={offer.surfaces} error={errors.surfaceId} onChange={(value) => update('surfaceId', value)} />
      {surface && (
        <div className="form-field catalog-field">
          <label htmlFor="piece-engraving">Engraving text</label>
          <input id="piece-engraving" value={selection.engraving} required maxLength={surface.maxCharacters * 2}
            aria-invalid={errors.engraving ? true : undefined} aria-describedby="engraving-hint engraving-count"
            onChange={(event) => update('engraving', event.target.value)} />
          <span className="catalog-help" id="engraving-hint">{errors.engraving ?? surface.instructions}</span>
          <span className="catalog-help" id="engraving-count" aria-live="polite">{engravingLength(selection.engraving)} / {surface.maxCharacters} characters</span>
        </div>
      )}
      {surface && <OptionField id="piece-font" label="Lettering style" value={selection.fontId} options={surface.fonts} error={errors.fontId} onChange={(value) => update('fontId', value)} />}
      {font?.previewCssClass && selection.engraving && (
        <p className="catalog-help">Lettering preview <span className={`catalog-lettering-sample engraving-font--${font.previewCssClass}`}>{selection.engraving}</span></p>
      )}
      <OptionField id="piece-destination" label="Delivery destination" value={selection.destination} options={inputCountryOptions} error={errors.destination} onChange={(value) => update('destination', value)} />
      {zone && <p className="catalog-help">Insured carrier delivery takes {timing(zone)} after production.{zone.signatureRequired ? ' Signature required.' : ''}</p>}
      <FinalSaleNotice />
      <button type="submit" className="button">{offer.surfaces.length ? 'Buy & Personalize' : 'Review Your Order'}</button>
    </form>
  );
}

export function ProductPage({ slug }: { slug: string }) {
  const product = products.find((item) => item.slug === slug);
  if (!product) return <h1>Piece unavailable</h1>;
  const offer = getPurchasableOffer(product);
  const collectionLinks = collections.filter((collection) => product.collections.includes(collection.slug));
  return (
    <article className="catalog-page catalog-product container">
      <figure className="catalog-feature-photo catalog-product__photo">
        <CatalogPhoto image={product.image} sizes="(max-width: 720px) 94vw, 50vw" eager />
        {!product.image.approved && <figcaption>Design concept. Exact specifications and availability are confirmed by the concierge.</figcaption>}
      </figure>
      <div className="catalog-product__content">
        <header className="page-intro catalog-intro">
          <p className="eyebrow">{productCategory(product.category)}</p>
          <h1>{product.name}</h1>
          <p>{product.description}</p>
        </header>
        <dl className="catalog-specifications">
          <Detail term="Materials">{product.materials}</Detail>
          <Detail term="Dimensions">{offer?.dimensions}</Detail>
          <Detail term="Stone details">{offer?.stone ? stoneSummary(offer.stone) : undefined}</Detail>
          <Detail term="Grading report">{offer?.stone?.family === 'diamond' ? offer.stone.gradingReport : undefined}</Detail>
          <Detail term="Production time">{offer ? timing(offer.production) : undefined}</Detail>
          <Detail term="Preorder availability">{offer?.availabilityDate ? <time dateTime={offer.availabilityDate}>{offer.availabilityDate}</time> : undefined}</Detail>
        </dl>
        {offer ? (
          <>
            <p className="catalog-price">{money.format(offer.priceUsd)} <span>USD</span></p>
            <PurchaseForm product={product} offer={offer} />
          </>
        ) : (
          <div className="catalog-inquiry">
            <p>Share your preferences and delivery destination to discuss what can be made for you.</p>
            <a className="button" href={`/contact/?piece=${encodeURIComponent(product.slug)}`}>Inquire about this piece</a>
          </div>
        )}
        <ul className="catalog-product__links" aria-label="Related collections">
          {collectionLinks.map((collection) => <li key={collection.slug}><a href={collectionPath(collection.slug)}>{collection.name}</a></li>)}
        </ul>
      </div>
    </article>
  );
}
