import { useState, type FormEvent } from 'react';
import { FINAL_SALE_NOTICE } from '../business';
import type { PrerenderedOffer, Product } from '../catalog-types';
import { engravingIssue, formatUsd, purchasableItems, type CatalogItem } from './api';
import { addToBag } from './bag';
import { useCatalog } from './use-catalog';

function Inquiry({ slug }: { slug: string }) {
  return (
    <div className="catalog-inquiry">
      <p>Share your preferences and delivery destination to discuss what can be made for you.</p>
      <a className="button" href={`/contact/?piece=${encodeURIComponent(slug)}`}>Inquire about this piece</a>
    </div>
  );
}

function AddToBag({ items }: { items: CatalogItem[] }) {
  const [sku, setSku] = useState(items.length === 1 ? items[0].sku : '');
  const [engraving, setEngraving] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [issue, setIssue] = useState('');
  const [added, setAdded] = useState(false);
  const item = items.find((option) => option.sku === sku);

  function resetFeedback() {
    setIssue('');
    setAdded(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item) return;
    const error = engravingIssue(engraving, item.engraving) ?? addToBag({ sku, quantity, engraving }, item.maxQuantity);
    setIssue(error ?? '');
    setAdded(!error);
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
        <button className="button" type="submit" disabled={!item}>Add to Bag</button>
        {added && <a className="button button--secondary" href="/bag/">View Bag</a>}
      </div>
      <p className="catalog-help" role="status">{added ? 'Added to your bag.' : ''}</p>
    </form>
  );
}

export function ProductPurchase({ product, prerenderedOffer }: { product: Product; prerenderedOffer?: PrerenderedOffer }) {
  const { state, reload } = useCatalog(product.image.approved);
  if (!product.image.approved) return <Inquiry slug={product.slug} />;

  if (state.status === 'loading') return (
    <div className="catalog-inquiry">
      {prerenderedOffer && <>
        <p className="catalog-help">{prerenderedOffer.variantName}</p>
        <p className="catalog-price">{formatUsd(prerenderedOffer.priceCents)} <span>USD</span></p>
      </>}
      <p className="catalog-help" role="status">Checking purchase options…</p>
      <Inquiry slug={product.slug} />
    </div>
  );
  if (state.status === 'failed') return (
    <div className="catalog-inquiry">
      <p className="catalog-help" role="status">Purchase options are temporarily unavailable.</p>
      <button className="catalog-text-button" type="button" onClick={reload}>Check again</button>
      <Inquiry slug={product.slug} />
    </div>
  );

  const items = purchasableItems(state.catalog, product.slug);
  return items.length ? <AddToBag items={items} /> : <Inquiry slug={product.slug} />;
}
