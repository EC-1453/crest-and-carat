import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { trackOrder, type TrackingInput, type TrackingResult } from './api';
import { CommerceError } from './http';
import { consumeTrackingFragment, orderStatusText, readRecentOrder, rememberOrder } from './order-session';
import './commerce.css';

const emptyInput: TrackingInput = { orderReference: '', token: '' };
const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

export function TrackOrder() {
  const [input, setInput] = useState(emptyInput);
  const [shipment, setShipment] = useState<TrackingResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const initialLink = useRef<TrackingInput | undefined>(undefined);

  const submit = useCallback(async (credentials: TrackingInput) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError('');
    setShipment(null);
    try {
      const result = await trackOrder(credentials, controller.signal);
      if (!controller.signal.aborted) {
        setShipment(result);
        rememberOrder(credentials);
      }
    } catch (issue) {
      if (!controller.signal.aborted) setError(issue instanceof CommerceError && issue.status === 404
        ? 'This private order link could not be verified. Check your confirmation or contact the concierge.'
        : 'We could not check your order status right now. Try again in a moment.');
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    function checkLink(useRecent = false) {
      const sharedLink = consumeTrackingFragment();
      if (sharedLink) initialLink.current = sharedLink;
      const credentials = sharedLink ?? (useRecent ? initialLink.current ?? readRecentOrder() : undefined);
      if (!credentials) return;
      setInput(credentials);
      void submit(credentials);
    }
    const onHashChange = () => checkLink();
    checkLink(true);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      const controller = pending.current;
      pending.current = null;
      controller?.abort();
    };
  }, [submit]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit({ orderReference: input.orderReference.trim().toUpperCase(), token: input.token.trim().toLowerCase() });
  }

  return (
    <div className="commerce-track">
      <form className="commerce-fields" onSubmit={handleSubmit}>
        <label className="catalog-field">Order reference
          <input required value={input.orderReference} onChange={(event) => setInput((value) => ({ ...value, orderReference: event.target.value }))}
            maxLength={48} spellCheck={false} autoComplete="off" disabled={loading} />
        </label>
        <label className="catalog-field">Private order code
          <input type="password" required value={input.token} onChange={(event) => setInput((value) => ({ ...value, token: event.target.value }))}
            maxLength={64} autoComplete="off" disabled={loading} aria-describedby="private-code-help" />
        </label>
        <p className="catalog-help" id="private-code-help">Open the private link in your order confirmation to fill in these fields.</p>
        <button className="button" type="submit" disabled={loading}>{loading ? 'Checking Status…' : 'Check Order Status'}</button>
      </form>
      {error && <p className="catalog-field-error" role="alert">{error}</p>}
      {shipment && (
        <section className="commerce-panel" aria-labelledby="private-order-heading">
          <h3 id="private-order-heading">Order {shipment.orderReference}</h3>
          <p role="status">{orderStatusText(shipment.status)}.</p>
          {shipment.checkoutUrl && <a className="button" href={shipment.checkoutUrl} rel="noreferrer">Open Secure Payment</a>}
          {shipment.shipments.length > 0 && <ul className="commerce-shipping">{shipment.shipments.map((item) => {
            const timestamp = new Date(item.shippedAt);
            return <li key={JSON.stringify([item.carrier, item.trackingNumber])}>
              <strong>{item.carrier}</strong>
              <div>Tracking number <bdi>{item.trackingNumber}</bdi></div>
              {Number.isFinite(timestamp.getTime()) && <time dateTime={item.shippedAt}>{date.format(timestamp)}</time>}
            </li>;
          })}</ul>}
        </section>
      )}
    </div>
  );
}
