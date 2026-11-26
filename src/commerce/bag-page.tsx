import { useEffect, useRef, useState, type FormEvent } from 'react';
import { openCheckout } from '../app-install';
import { FINAL_SALE_NOTICE } from '../business';
import { products } from '../catalog';
import { createOrder, engravingIssue, formatUsd, requestQuote, type Address, type BagLine, type Catalog, type CatalogItem, type OrderResult, type QuoteInput, type QuoteResult } from './api';
import { changeBagEngraving, clearOrderedLines, updateBag, useBag } from './bag';
import { CommerceError } from './http';
import { forgetOrderAttempt, orderRequestId, orderStatusText, rememberOrder, resumeHostedCheckout, trackingLink } from './order-session';
import { useCatalog } from './use-catalog';
import './commerce.css';

const emptyAddress: Address = { fullName: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: '' };
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

function bagLineKey(line: BagLine): string {
  return JSON.stringify([line.sku, line.engraving]);
}

function BagItem({ line, item, index, remainingLimit, disabled }: { line: BagLine; item?: CatalogItem; index: number; remainingLimit: number; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [engraving, setEngraving] = useState(line.engraving);
  const [error, setError] = useState('');
  const name = item ? `${item.name} · ${item.variantName}` : line.sku;
  const maxOptions = Math.max(remainingLimit, line.quantity);

  function saveEngraving() {
    if (!item) return;
    const issue = engravingIssue(engraving, item.engraving);
    if (issue) setError(issue);
    else {
      changeBagEngraving(line, engraving);
      setEditing(false);
      setError('');
    }
  }

  return (
    <li className="commerce-line">
      <div>
        <h3>{item ? <a href={`/products/${encodeURIComponent(item.productSlug)}/`}>{item.name}</a> : 'Unavailable piece'}</h3>
        <p>{item?.variantName ?? line.sku}</p>
        {item ? <p>{formatUsd(item.priceCents)} USD each</p> : <p>Remove this piece or ask the concierge about availability.</p>}
        {(line.engraving || item?.engraving.maxLength) ? (
          <p className="commerce-personalization">Engraving {line.engraving ? <bdi className="commerce-engraving">{line.engraving}</bdi> : 'None'}</p>
        ) : null}
        {editing && item && (
          <div className="catalog-field commerce-edit">
            <label htmlFor={`bag-engraving-${index}`}>Engraving {item.engraving.required ? '' : '(optional)'}</label>
            <input id={`bag-engraving-${index}`} value={engraving} spellCheck={false} autoCapitalize="off" autoComplete="off"
              maxLength={item.engraving.maxLength * 2} disabled={disabled} onChange={(event) => setEngraving(event.target.value)} />
            <p className="catalog-help">{item.engraving.instructions}</p>
            <div className="button-row">
              <button className="button button--secondary" type="button" disabled={disabled} onClick={saveEngraving}>Save Engraving</button>
              <button className="catalog-text-button" type="button" onClick={() => { setEditing(false); setError(''); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      <div className="commerce-line__actions">
        {item && (
          <div className="catalog-field commerce-quantity">
            <label htmlFor={`bag-quantity-${index}`}>Quantity <span className="sr-only">for {name}, item {index + 1}</span></label>
            <select id={`bag-quantity-${index}`} value={line.quantity} disabled={disabled} onChange={(event) => {
              setError(updateBag(line, Number(event.target.value), item.maxQuantity) ?? '');
            }}>
              {Array.from({ length: maxOptions }, (_, place) => place + 1).map((quantity) => (
                <option key={quantity} value={quantity} disabled={quantity > remainingLimit}>{quantity}</option>
              ))}
            </select>
          </div>
        )}
        {Boolean(item?.engraving.maxLength) && !editing && (
          <button className="catalog-text-button" type="button" disabled={disabled} onClick={() => { setEngraving(line.engraving); setEditing(true); }}>
            Edit engraving<span className="sr-only"> for {name}, item {index + 1}</span>
          </button>
        )}
        <button className="catalog-text-button" type="button" disabled={disabled} onClick={() => updateBag(line, 0, Number.MAX_SAFE_INTEGER)}>
          Remove<span className="sr-only"> {name}, item {index + 1}</span>
        </button>
      </div>
      {error && <p className="catalog-field-error" role="alert">{error}</p>}
    </li>
  );
}

function DeliveryFields({ address, countries, update }: { address: Address; countries: Catalog['shipping']; update: (field: keyof Address, value: string) => void }) {
  const isUs = address.country === 'US';
  return (
    <div className="commerce-fields">
      <label className="catalog-field">Country or territory
        <select required value={address.country} autoComplete="shipping country" onChange={(event) => update('country', event.target.value)}>
          <option value="">Choose a destination</option>
          {countries.map(({ country }) => <option key={country} value={country}>{countryNames.of(country) ?? country}</option>)}
        </select>
      </label>
      <label className="catalog-field">Recipient name
        <input required maxLength={100} autoComplete="shipping name" value={address.fullName} onChange={(event) => update('fullName', event.target.value)} />
      </label>
      <label className="catalog-field">Street address
        <input required maxLength={160} autoComplete="shipping address-line1" value={address.line1} onChange={(event) => update('line1', event.target.value)} />
      </label>
      <label className="catalog-field">Apartment, suite or building (optional)
        <input maxLength={160} autoComplete="shipping address-line2" value={address.line2} onChange={(event) => update('line2', event.target.value)} />
      </label>
      <label className="catalog-field">City
        <input required maxLength={80} autoComplete="shipping address-level2" value={address.city} onChange={(event) => update('city', event.target.value)} />
      </label>
      <label className="catalog-field">{isUs ? 'Two-letter state code' : 'State or province (optional)'}
        <input required={isUs} pattern={isUs ? '[A-Za-z]{2}' : undefined} maxLength={isUs ? 2 : 80} autoComplete="shipping address-level1"
          autoCapitalize={isUs ? 'characters' : 'words'} value={address.state} onChange={(event) => update('state', event.target.value)} />
      </label>
      <label className="catalog-field">{isUs ? 'ZIP code' : 'Postal code (optional)'}
        <input required={isUs} pattern={isUs ? '[0-9]{5}(-[0-9]{4})?' : undefined} maxLength={isUs ? 10 : 24} autoComplete="shipping postal-code"
          value={address.postalCode} onChange={(event) => update('postalCode', event.target.value)} />
      </label>
    </div>
  );
}

function OrderReview({ result, address, email, processor }: { result: QuoteResult; address: Address; email: string; processor: string }) {
  const { quote } = result;
  const details = [address.fullName, address.line1, address.line2, [address.city, address.state, address.postalCode].filter(Boolean).join(', '), countryNames.of(address.country) ?? address.country];
  return (
    <div className="commerce-review">
      <h2>Review Your Order</h2>
      <ul className="commerce-review__items">
        {quote.items.map((item) => (
          <li key={bagLineKey(item)}>
            <strong>{item.name}</strong><p>{item.variantName} · Quantity {item.quantity}</p>
            {item.engraving && <p>Engraving <bdi className="commerce-engraving">{item.engraving}</bdi></p>}
            <p>{formatUsd(item.priceCents * item.quantity)}</p>
          </li>
        ))}
      </ul>
      <div className="commerce-review__delivery">
        <h3>Delivery and Payment</h3>
        <address>{details.filter(Boolean).map((detail, index) => <div key={index}>{detail}</div>)}</address>
        <p>{email}<br />{processor}</p>
      </div>
      <dl className="commerce-totals">
        <div><dt>Subtotal</dt><dd>{formatUsd(quote.subtotalCents)}</dd></div>
        <div><dt>{quote.shippingLabel}</dt><dd>{formatUsd(quote.shippingCents)}</dd></div>
        <div><dt>Tax</dt><dd>{formatUsd(quote.taxCents)}</dd></div>
        <div className="commerce-total"><dt>Total</dt><dd>{formatUsd(quote.totalCents)} USD</dd></div>
      </dl>
      <p className="catalog-help">{quote.taxDisclosure}</p>
    </div>
  );
}

function OrderConfirmation({ order, onOpenPayment }: { order: OrderResult; onOpenPayment: (url: string) => void }) {
  const checkoutUrl = resumeHostedCheckout(order);
  return (
    <section className="commerce-panel" aria-labelledby="commerce-order-heading">
      <h2 id="commerce-order-heading">Order {order.orderReference}</h2>
      <p role="status">{orderStatusText(order.status)}.</p>
      {order.checkoutState === 'creating' && !checkoutUrl && <p>We are preparing your secure payment link. Use the same checkout attempt to check again.</p>}
      {order.checkoutState === 'uncertain' && order.status === 'pending' && <p>We are checking the payment link. Keep this order reference if you contact the concierge.</p>}
      <div className="button-row">
        {checkoutUrl && <a className="button" href={checkoutUrl} rel="noreferrer" onClick={(event) => { event.preventDefault(); onOpenPayment(checkoutUrl); }}>Open Secure Payment</a>}
        <a className="button button--secondary" href={trackingLink({ orderReference: order.orderReference, token: order.trackingToken })}>Track Order</a>
      </div>
    </section>
  );
}

function Checkout({ lines, catalog, refreshCatalog }: { lines: readonly BagLine[]; catalog: Catalog; refreshCatalog: () => void }) {
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [processor, setProcessor] = useState(catalog.processors.length === 1 ? catalog.processors[0].id : '');
  const [email, setEmail] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [review, setReview] = useState<{ key: string; result: QuoteResult } | null>(null);
  const [loading, setLoading] = useState<'quote' | 'order' | null>(null);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const running = useRef<AbortController | null>(null);
  const reviewHeading = useRef<HTMLDivElement>(null);
  const itemMap = new Map(catalog.items.map((item) => [item.sku, item]));
  const photographedProducts = new Set(products.filter((product) => product.image.approved).map((product) => product.slug));
  const bag = lines.map((line) => {
    const item = itemMap.get(line.sku);
    return { line, item: item && photographedProducts.has(item.productSlug) ? item : undefined };
  });
  const skuTotals = new Map<string, number>();
  for (const line of lines) skuTotals.set(line.sku, (skuTotals.get(line.sku) ?? 0) + line.quantity);
  const countries = catalog.shipping.filter(({ country }) => bag.every(({ item }) => item?.destinations.includes(country)));
  const hasInvalidItems = bag.some(({ line, item }) => !item || (skuTotals.get(line.sku) ?? 0) > item.maxQuantity || Boolean(engravingIssue(line.engraving, item.engraving)));
  const checkoutAvailable = Boolean(lines.length && catalog.termsVersion && catalog.processors.length && countries.length && !hasInvalidItems);
  const country = countries.some((option) => option.country === address.country) ? address.country : '';
  const payment = catalog.processors.find((option) => option.id === processor);
  const trimmedAddress = { fullName: address.fullName.trim(), line1: address.line1.trim(), line2: address.line2.trim(), city: address.city.trim(),
    state: country === 'US' ? address.state.trim().toUpperCase() : address.state.trim(), postalCode: address.postalCode.trim(), country };
  const input: QuoteInput = { items: lines, address: trimmedAddress, processor: payment?.id ?? '' };
  const orderDetails = { ...input, email: email.trim(), marketingOptIn, termsVersion: catalog.termsVersion };
  const inputKey = JSON.stringify(orderDetails);
  const chosenReview = review?.key === inputKey ? review.result : null;
  const finished = order && (resumeHostedCheckout(order) || order.status !== 'pending');

  useEffect(() => () => running.current?.abort(), []);
  useEffect(() => { if (chosenReview) reviewHeading.current?.focus(); }, [chosenReview]);

  function resetReview() {
    setReview(null);
    setTermsAccepted(false);
    setError('');
    setOrder(null);
    setSubmitted(false);
  }

  function onAddress(field: keyof Address, value: string) {
    resetReview();
    setAddress((current) => ({ ...current, ...(field === 'country' && current.country !== value ? { state: '', postalCode: '' } : {}), [field]: value }));
  }

  async function openPayment(url: string) {
    try {
      await openCheckout(url);
    } catch {
      setError('The secure payment page could not open. Use the payment link on this page to try again.');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current || !checkoutAvailable || !payment) return;
    setError('');
    const controller = new AbortController();
    running.current = controller;
    setLoading(chosenReview ? 'order' : 'quote');
    try {
      if (!chosenReview) {
        const result = await requestQuote(input, controller.signal);
        if (!controller.signal.aborted) {
          setReview({ key: inputKey, result });
          setTermsAccepted(false);
        }
        return;
      }
      if (!termsAccepted) return;
      setSubmitted(true);
      const requestId = await orderRequestId(inputKey);
      const result = await createOrder({ ...input, email: orderDetails.email, marketingOptIn, requestId, termsAccepted: true,
        termsVersion: chosenReview.quote.termsVersion, quoteToken: chosenReview.quoteToken }, controller.signal);
      if (controller.signal.aborted) return;
      rememberOrder({ orderReference: result.orderReference, token: result.trackingToken });
      setOrder(result);
      const url = resumeHostedCheckout(result);
      if (url || result.status !== 'pending') {
        clearOrderedLines(lines);
        forgetOrderAttempt();
      }
      if (url) await openPayment(url);
    } catch (issue) {
      if (controller.signal.aborted) return;
      if (issue instanceof CommerceError && issue.status === 409) {
        resetReview();
        setError(issue.publicMessage ?? 'Your quote or order terms changed. Review the updated total.');
      } else if (issue instanceof CommerceError && issue.publicMessage) {
        setError(issue.publicMessage);
      } else {
        setError(chosenReview ? 'We could not confirm the payment link. Retry with the same order details.' : 'We could not get a quote. Check your connection and try again.');
      }
    } finally {
      running.current = null;
      if (!controller.signal.aborted) setLoading(null);
    }
  }

  if (!lines.length && !order) return <div className="commerce-panel"><p>Your bag is empty.</p><a className="button" href="/shop/">Explore the Collection</a></div>;

  return (
    <>
      {order && <OrderConfirmation order={order} onOpenPayment={(url) => void openPayment(url)} />}
      {finished ? (error && <p className="catalog-field-error" role="alert">{error}</p>) : (
        <>
          {lines.length > 0 && (
            <section aria-labelledby="bag-contents">
              <h2 id="bag-contents">Your Pieces</h2>
              <ul className="commerce-lines">
                {bag.map(({ line, item }, index) => (
                  <BagItem key={bagLineKey(line)} line={line} item={item} index={index} disabled={Boolean(loading) || submitted}
                    remainingLimit={(item?.maxQuantity ?? line.quantity) - (skuTotals.get(line.sku) ?? 0) + line.quantity} />
                ))}
              </ul>
            </section>
          )}
          {checkoutAvailable ? (
            <form className="commerce-form" onSubmit={(event) => void submit(event)}>
              <fieldset className="commerce-panel" disabled={Boolean(loading) || submitted}>
                <legend>Delivery</legend>
                <DeliveryFields address={{ ...address, country }} countries={countries} update={onAddress} />
              </fieldset>
              <fieldset className="commerce-panel" disabled={Boolean(loading) || submitted}>
                <legend>Contact and Payment</legend>
                <div className="commerce-fields">
                  <label className="catalog-field">Order email
                    <input type="email" required autoComplete="email" maxLength={254} value={email} onChange={(event) => { resetReview(); setEmail(event.target.value); }} />
                  </label>
                  <label className="catalog-field">Payment method
                    <select required value={payment?.id ?? ''} onChange={(event) => { resetReview(); setProcessor(event.target.value); }}>
                      <option value="">Choose a payment method</option>
                      {catalog.processors.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </label>
                </div>
                <label className="catalog-opt-in"><input type="checkbox" checked={marketingOptIn} onChange={(event) => { resetReview(); setMarketingOptIn(event.target.checked); }} />
                  <span>Send me occasional notes from the Private List. I can unsubscribe at any time.</span>
                </label>
                <p className="catalog-help">Payment details are entered on the provider’s secure payment page.</p>
              </fieldset>
              {chosenReview && (
                <div className="commerce-panel commerce-approval" ref={reviewHeading} tabIndex={-1}>
                  <OrderReview result={chosenReview} address={trimmedAddress} email={orderDetails.email} processor={payment?.label ?? ''} />
                  {lines.some(({ engraving }) => engraving) && <p className="catalog-help">{FINAL_SALE_NOTICE}</p>}
                  <label className="catalog-opt-in">
                    <input type="checkbox" required checked={termsAccepted} disabled={Boolean(loading) || submitted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                    <span>I confirm my pieces, engraving, delivery address and total. I accept the <a href="/terms/" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a> (version {chosenReview.quote.termsVersion}) and the <a href="/custom-orders-final-sale/" target="_blank" rel="noopener noreferrer">custom order terms</a> where applicable.</span>
                  </label>
                </div>
              )}
              {error && <p className="catalog-field-error" role="alert">{error}</p>}
              <div className="button-row">
                <button className="button" type="submit" disabled={Boolean(loading)}>{loading === 'quote' ? 'Preparing Your Quote…' : loading === 'order' ? 'Preparing Payment…' : submitted ? 'Check Payment Link' : chosenReview ? 'Continue to Secure Payment' : 'Review Order Total'}</button>
                {submitted && <a className="button button--secondary" href="/track-order/">Check Order Status</a>}
              </div>
              <p className="catalog-help" role="status">{loading === 'order' ? 'Creating or recovering your payment link.' : loading === 'quote' ? 'Checking prices, delivery and tax.' : ''}</p>
            </form>
          ) : (
            <div className="commerce-panel">
              <p>{hasInvalidItems ? 'Review the pieces, quantities and engravings in your bag.' : !countries.length ? 'These pieces cannot ship together to a configured destination.' : 'Online checkout is temporarily unavailable.'}</p>
              <div className="button-row">
                <button type="button" className="button button--secondary" onClick={refreshCatalog}>Refresh Availability</button>
                <a className="button" href="/contact/">Contact the Concierge</a>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

export function BagPage() {
  const lines = useBag();
  const { state, reload } = useCatalog(lines.length > 0);
  return (
    <div className="container commerce-page catalog-page">
      <header className="page-intro catalog-intro">
        <p className="eyebrow">Private Client Orders</p>
        <h1>Your Bag</h1>
      </header>
      {state.status !== 'ready' && lines.length === 0 ? <div className="commerce-panel"><p>Your bag is empty.</p><a className="button" href="/shop/">Explore the Collection</a></div> : state.status === 'loading' ? <p role="status">Opening your bag…</p> : state.status === 'failed' ? (
        <div className="commerce-panel">
          <p role="status">We could not check current availability. Your bag will be here when you try again.</p>
          <button type="button" className="button" onClick={reload}>Try Again</button>
        </div>
      ) : <Checkout lines={lines} catalog={state.catalog} refreshCatalog={reload} />}
    </div>
  );
}
