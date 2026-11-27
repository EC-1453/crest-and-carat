import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FINAL_SALE_NOTICE } from '../business';
import type { PrerenderedOffer, Product } from '../catalog-types';
import { engravingIssue, formatUsd, purchasableItems, type CatalogItem } from './api';
import { addToBag } from './bag';
import { useCatalog } from './use-catalog';

export function dossierPath(slug: string): string {
  return `/contact/?piece=${encodeURIComponent(slug)}&request=dossier`;
}

export function CommissionEstimate({ priceCents }: { priceCents?: number }) {
  if (priceCents === undefined) return null;
  return (
    <p className="catalog-price-estimate">
      <span>Indicative commission from</span>
      <strong>{formatUsd(priceCents)} USD</strong>
    </p>
  );
}

function DossierLink({ slug, secondary = false }: { slug: string; secondary?: boolean }) {
  return (
    <a className={secondary ? 'button button--secondary' : 'button'} href={dossierPath(slug)}>
      Request Private Concierge Dossier
    </a>
  );
}

function Inquiry({ product }: { product: Product }) {
  return (
    <div className="catalog-inquiry">
      {!product.verifiedDetails && <CommissionEstimate priceCents={product.commission?.startingPriceCents} />}
      <p className="catalog-inquiry__copy">Confirm details, customization, pricing and delivery with your private concierge.</p>
      <DossierLink slug={product.slug} />
    </div>
  );
}

function AcquireForm({ items, slug }: { items: CatalogItem[]; slug: string }) {
  const [sku, setSku] = useState(items.length === 1 ? items[0].sku : '');
  const [engraving, setEngraving] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [issue, setIssue] = useState('');
  const [acquiring, setAcquiring] = useState(false);
  const navigating = useRef(false);
  const item = items.find((option) => option.sku === sku);

  useEffect(() => {
    function restoreForm(event: PageTransitionEvent) {
      if (!event.persisted) return;
      navigating.current = false;
      setAcquiring(false);
    }
    window.addEventListener('pageshow', restoreForm);
    return () => window.removeEventListener('pageshow', restoreForm);
  }, []);

  function resetFeedback() {
    setIssue('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || navigating.current) return;
    const error = engravingIssue(engraving, item.engraving) ?? addToBag({ sku, quantity, engraving }, item.maxQuantity, { requirePersistence: true });
    if (error) {
      setIssue(error);
      return;
    }
    setIssue('');
    navigating.current = true;
    setAcquiring(true);
    window.location.assign('/bag/');
  }

  return (
    <form className="catalog-purchase" onSubmit={handleSubmit}>
      <h2>Choose Your Piece</h2>
      {items.length > 1 ? (
        <div className="catalog-field">
          <label htmlFor="piece-variant">Piece option</label>
          <select id="piece-variant" value={sku} required onChange={(event) => {
            setSku(event.target.value);
            setEngraving('');
            setQuantity(1);
            resetFeedback();
          }}>
            <option value="">Select an option</option>
            {items.map((option) => <option key={option.sku} value={option.sku}>{option.variantName} · {formatUsd(option.priceCents)}</option>)}
          </select>
        </div>
      ) : <p className="catalog-help">{item?.variantName}</p>}
      {item && (
        <>
          <p className="catalog-price">{formatUsd(item.priceCents)} <span>USD</span></p>
          {item.engraving.maxLength > 0 && (
            <div className="catalog-field">
              <label htmlFor="piece-engraving">Engraving {item.engraving.required ? '' : '(optional)'}</label>
              <input id="piece-engraving" value={engraving} spellCheck={false} autoCapitalize="off" autoComplete="off"
                required={item.engraving.required} maxLength={item.engraving.maxLength * 2}
                aria-describedby="engraving-requirements" onChange={(event) => {
                  setEngraving(event.target.value);
                  resetFeedback();
                }} />
              <p className="catalog-help" id="engraving-requirements">
                {item.engraving.instructions} {Array.from(engraving).length} / {item.engraving.maxLength} characters.
                {' '}Your spelling, letter case and spacing will be kept as entered.
              </p>
            </div>
          )}
          <div className="catalog-field commerce-quantity">
            <label htmlFor="piece-quantity">Quantity</label>
            <select id="piece-quantity" value={quantity} onChange={(event) => {
              setQuantity(Number(event.target.value));
              resetFeedback();
            }}>
              {Array.from({ length: item.maxQuantity }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          {engraving && <p className="catalog-help">Engraving preview <bdi className="commerce-engraving">{engraving}</bdi></p>}
          {item.engraving.maxLength > 0 && <p className="catalog-help">{FINAL_SALE_NOTICE} <a className="catalog-text-link" href="/custom-orders-final-sale/">Custom order terms</a></p>}
        </>
      )}
      {issue && <p className="catalog-field-error" role="alert">{issue}</p>}
      <div className="button-row">
        <button className="button" type="submit" disabled={!item || acquiring}>Acquire Piece</button>
        <DossierLink slug={slug} secondary />
      </div>
      {acquiring && <p className="catalog-help" role="status">Opening checkout…</p>}
    </form>
  );
}

export function ProductPurchase({ product, prerenderedOffer }: { product: Product; prerenderedOffer?: PrerenderedOffer }) {
  const hasApprovedDetails = product.image.approved && Boolean(product.verifiedDetails);
  const { state, reload } = useCatalog(hasApprovedDetails);
  if (!hasApprovedDetails) return <Inquiry product={product} />;

  if (state.status === 'loading') return (
    <div className="catalog-inquiry">
      {prerenderedOffer && <>
        <p className="catalog-help">{prerenderedOffer.variantName}</p>
        <p className="catalog-price">{formatUsd(prerenderedOffer.priceCents)} <span>USD</span></p>
      </>}
      <p className="catalog-help" role="status">Checking purchase options…</p>
      <DossierLink slug={product.slug} />
    </div>
  );
  if (state.status === 'failed') return (
    <div className="catalog-inquiry">
      <p className="catalog-help" role="status">Purchase options are temporarily unavailable.</p>
      <button className="catalog-text-button" type="button" onClick={reload}>Check again</button>
      <DossierLink slug={product.slug} />
    </div>
  );

  const items = purchasableItems(state.catalog, product.slug);
  return items.length ? <AcquireForm items={items} slug={product.slug} /> : <Inquiry product={product} />;
}
