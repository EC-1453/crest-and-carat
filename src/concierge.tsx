import { useEffect, useRef, useState } from 'react';
import type { ComponentPropsWithoutRef, FormEvent, ReactNode } from 'react';
import { SUPPORT_ALIAS, SUPPORT_EMAIL } from './business';
import { collections, products } from './catalog';
import { apiEndpoint, newRequestId } from './commerce/http';
import './concierge.css';

export type SubscriberSource = 'vip' | 'inquiry' | 'checkout';

type SubscriberInput = {
  source: SubscriberSource;
  email: string;
  marketingConsent: boolean;
  requestId?: string;
  productSlug?: string;
  sourcePage?: string;
  interestCategory?: string;
  name?: string;
  message?: string;
  website?: string;
};

type SubscriberResult =
  | { status: 'saved'; forwarding: 'delivered' | 'manual' }
  | { status: 'unavailable' | 'invalid'; message: string };

const fallbackMessage = 'Concierge forms are temporarily unavailable. You can continue by email below.';
const privateListSessionKey = 'crest-and-carat.private-list.seen';
const privateListEvent = 'crest-and-carat:private-list';
const dossierRequest = 'Request: Private Concierge Dossier';
const messageLimit = 2000;

export async function submitSubscriber(input: SubscriberInput, signal?: AbortSignal): Promise<SubscriberResult> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(apiEndpoint('/api/subscribers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      body: JSON.stringify({ ...input, requestId: input.requestId || newRequestId() }),
      signal: controller.signal,
    });

    if (response.status === 400) {
      return { status: 'invalid', message: 'Please check the email address and complete the required fields.' };
    }

    if (response.ok && response.headers.get('Content-Type')?.includes('application/json')) {
      const result: unknown = await response.json();
      if (typeof result === 'object' && result !== null && 'saved' in result && result.saved === true &&
        'forwarding' in result && (result.forwarding === 'delivered' || result.forwarding === 'manual')) {
        return { status: 'saved', forwarding: result.forwarding };
      }
    }
  } catch {
    return { status: 'unavailable', message: fallbackMessage };
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }

  return { status: 'unavailable', message: fallbackMessage };
}

function mailLink(subject: string, body: string) {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function rememberListVisit() {
  try {
    sessionStorage.setItem(privateListSessionKey, 'true');
  } catch {
    // The inline form still works when a browser restricts session storage.
  }
}

function listWasSeen() {
  try {
    return sessionStorage.getItem(privateListSessionKey) === 'true';
  } catch {
    return false;
  }
}

function useSubscriberSubmission() {
  const [result, setResult] = useState<SubscriberResult | null>(null);
  const [sending, setSending] = useState(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  async function send(input: SubscriberInput) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setSending(true);
    setResult(null);

    try {
      const fingerprint = JSON.stringify(input);
      if (request.current?.fingerprint !== fingerprint) {
        request.current = { fingerprint, id: newRequestId() };
      }
      const result = await submitSubscriber({ ...input, requestId: request.current.id }, controller.signal);
      if (!controller.signal.aborted) setResult(result);
    } catch {
      if (!controller.signal.aborted) setResult({ status: 'unavailable', message: fallbackMessage });
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setSending(false);
    }
  }

  return { result, sending, send };
}

function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function subscriberContext() {
  const path = window.location.pathname;
  const sourcePage = /^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*$/iu.test(path) ? path : '/';
  const [, route, slug] = sourcePage.split('/');
  const interestCategory = route === 'collections' ? collections.find((item) => item.slug === slug)?.slug
    : route === 'products' ? products.find((item) => item.slug === slug)?.category : undefined;
  return { sourcePage, interestCategory };
}

function Honeypot() {
  return (
    <div className="concierge-honeypot" hidden aria-hidden="true">
      <label>Website <input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
    </div>
  );
}

type ConsentCheckboxProps = Pick<ComponentPropsWithoutRef<'input'>,
  'aria-describedby' | 'checked' | 'disabled' | 'name' | 'onChange' | 'required' | 'value'
> & { children: ReactNode };

export function ConsentCheckbox({ children, ...inputProps }: ConsentCheckboxProps) {
  return (
    <label className="concierge-consent">
      <input type="checkbox" {...inputProps} />
      <span className="concierge-consent__indicator" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

export function PrivateList({ compact = false, placement = 'footer' }: { compact?: boolean; placement?: 'footer' | 'drawer' }) {
  const [email, setEmail] = useState('');
  const { result, sending, send } = useSubscriberSubmission();
  const success = useRef<HTMLParagraphElement>(null);
  const emailId = `${placement}-vip-email`;
  const titleId = `${placement}-vip-title`;
  const inDrawer = placement === 'drawer';

  useEffect(() => {
    if (result?.status === 'saved') success.current?.focus();
  }, [result]);
  const fallbackLink = mailLink(
    'Join the CREST & CARAT Private List',
    `Please add ${email || 'my email address'} to the CREST & CARAT Private List. I agree to receive occasional marketing emails and can unsubscribe at any time.`,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    rememberListVisit();
    if (!inDrawer) window.dispatchEvent(new Event(privateListEvent));
    await send({
      ...subscriberContext(),
      source: 'vip',
      email: email.trim(),
      marketingConsent: form.get('marketingConsent') === 'yes',
      website: formText(form, 'website'),
    });
  }

  return (
    <section className={`private-list${compact ? ' private-list--compact' : ''}`} aria-labelledby={titleId}>
      <div className="private-list__intro">
        {inDrawer && <span className="concierge-kicker">The Private List</span>}
        <h2 id={titleId}>{inDrawer ? 'An invitation from the house' : 'Join the Private List'}</h2>
        <p>Discover new pieces, bespoke gifting ideas, and notes from the house.</p>
      </div>
      {result?.status === 'saved' ? (
        <p className="concierge-result" tabIndex={-1} ref={success}>You’re on the Private List. Thank you for joining.</p>
      ) : (
        <form className="private-list__form" action="/api/subscribers" method="post" onSubmit={handleSubmit}>
          <Honeypot />
          <div className="private-list__entry">
            <label className="concierge-visually-hidden" htmlFor={emailId}>Email address</label>
            <input type="email" id={emailId} name="email" required maxLength={254} autoComplete="email" placeholder="Your email address" value={email} onChange={(event) => setEmail(event.target.value)} />
            <button className="button" type="submit" disabled={sending}>{sending ? 'Joining…' : 'Join the List'}</button>
          </div>
          <ConsentCheckbox name="marketingConsent" value="yes" required>
            I agree to receive marketing emails from CREST &amp; CARAT. I can unsubscribe at any time.
          </ConsentCheckbox>
          <a className="concierge-privacy" href="/privacy/">Privacy policy</a>
          <noscript><a href={fallbackLink}>Request access by email</a></noscript>
          <div aria-live="polite">
            {result && <p className="concierge-result">{result.message} {result.status === 'unavailable' && <a href={fallbackLink}>Email the concierge</a>}</p>}
          </div>
        </form>
      )}
    </section>
  );
}

export function PrivateListDrawer() {
  const [visible, setVisible] = useState(false);
  const seen = useRef(false);
  const drawer = useRef<HTMLElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const path = location.pathname;
    if (listWasSeen() || /^\/(contact|privacy|app)(\/|$)/.test(path)) return;

    const start = Date.now();
    function reveal() {
      if (seen.current || listWasSeen() || document.querySelector('dialog[open]')) return;
      const footer = document.getElementById('footer-vip-title');
      const footerTop = footer?.getBoundingClientRect().top;
      if (footerTop !== undefined && footerTop < window.innerHeight) return;
      seen.current = true;
      rememberListVisit();
      lastFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setVisible(true);
    }

    function onScroll() {
      const remaining = document.documentElement.scrollHeight - window.innerHeight;
      if (remaining > 0 && window.scrollY / remaining >= 0.52 && Date.now() - start >= 10_000) reveal();
    }

    function onExit(event: MouseEvent) {
      if (event.clientY <= 0 && Date.now() - start >= 12_000 && matchMedia('(hover: hover) and (pointer: fine)').matches) reveal();
    }

    function onInlineSignup() {
      seen.current = true;
      setVisible(false);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    document.documentElement.addEventListener('mouseleave', onExit);
    window.addEventListener(privateListEvent, onInlineSignup);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.documentElement.removeEventListener('mouseleave', onExit);
      window.removeEventListener(privateListEvent, onInlineSignup);
    };
  }, []);

  function dismiss() {
    if (drawer.current?.contains(document.activeElement)) {
      const target = lastFocus.current;
      if (target && target !== document.body && target.isConnected) target.focus();
      else document.querySelector<HTMLElement>('main[tabindex]')?.focus();
    }
    setVisible(false);
  }

  return visible ? (
    <aside
      className="private-list-drawer"
      aria-labelledby="drawer-vip-title"
      ref={drawer}
      onKeyDown={(event) => { if (event.key === 'Escape') dismiss(); }}
    >
      <button className="private-list-drawer__close" type="button" aria-label="Close Private List invitation" onClick={dismiss}>×</button>
      <PrivateList compact placement="drawer" />
    </aside>
  ) : null;
}

export function ContactPage() {
  const [piece, setPiece] = useState('');
  const [requestDossier, setRequestDossier] = useState(false);
  const [message, setMessage] = useState('');
  const [fallbackLink, setFallbackLink] = useState('');
  const { result, send, sending } = useSubscriberSubmission();
  const success = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (result?.status === 'saved') success.current?.focus();
  }, [result]);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const selectedPiece = query.get('piece');
    if (selectedPiece && products.some((product) => product.slug === selectedPiece)) {
      setPiece(selectedPiece);
      setRequestDossier(query.get('request') === 'dossier');
      return;
    }
    const collection = collections.find(({ slug }) => slug === query.get('collection'));
    if (collection) setMessage(`I’m interested in the ${collection.name} collection.`);

  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = formText(form, 'email');
    const name = formText(form, 'name');
    const note = formText(form, 'message');
    const message = requestDossier ? `${dossierRequest}\n\n${note}`.trimEnd() : note;
    const marketingConsent = form.get('marketingConsent') === 'yes';
    const product = products.find((item) => item.slug === piece);
    const details = [
      ...(name ? [`Name: ${name}`] : []),
      `Email: ${email}`,
      ...(product ? [`Piece: ${product.name}`] : []),
      `Private List opt-in: ${marketingConsent ? 'Yes' : 'No'}`,
      '',
      message,
    ].join('\n');
    const subject = product
      ? requestDossier ? `Private Concierge Dossier for ${product.name}` : `Inquiry about ${product.name}`
      : 'CREST & CARAT concierge inquiry';
    setFallbackLink(mailLink(subject, details));
    const collection = collections.find(({ slug }) => slug === new URLSearchParams(window.location.search).get('collection'));
    await send({ ...subscriberContext(), source: 'inquiry', email, name, message, marketingConsent, website: formText(form, 'website'),
      interestCategory: product?.slug ?? collection?.slug, ...(piece ? { productSlug: piece } : {}) });
  }

  return (
    <section className="contact-page" aria-labelledby="contact-title">
      <div className="contact-page__intro">
        <span className="concierge-kicker">Private Client Concierge</span>
        <h1 id="contact-title" tabIndex={-1}>{requestDossier ? 'Request a Private Dossier' : 'Contact CREST & CARAT'}</h1>
        <p>{requestDossier
          ? 'Ask for the available specifications, provenance and personalization options for your selected piece. Your concierge can also confirm acquisition terms and insured delivery for your destination.'
          : 'Tell us about the piece, occasion, or detail you have in mind. We can help with personalization, gifting, and insured delivery to the US, Gulf, and international destinations.'}</p>
        <a className="contact-page__email" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        {SUPPORT_ALIAS && SUPPORT_ALIAS !== SUPPORT_EMAIL && <a className="contact-page__email" href={`mailto:${SUPPORT_ALIAS}`}>{SUPPORT_ALIAS}</a>}
        <a className="concierge-privacy" href="/track-order/">Need an update on an existing order?</a>
      </div>
      {result?.status === 'saved' ? (
        <div className="contact-page__form contact-page__response">
          <h2 tabIndex={-1} ref={success}>{requestDossier ? 'Thank you for requesting a dossier.' : 'Thank you for your inquiry.'}</h2>
          {result.forwarding === 'delivered' ? <p>Your inquiry has been sent. We’ll reply to the email address you provided.</p> : (
            <p>Your inquiry was saved. <a href={fallbackLink}>Open a copy in your email app</a> to send it directly to the concierge.</p>
          )}
        </div>
      ) : (
        <form className="contact-page__form" action="/api/subscribers" method="post" onSubmit={handleSubmit}>
          <Honeypot />
          <label>Your name <span>(optional)</span><input name="name" autoComplete="name" maxLength={100} /></label>
          <label>Email address<input type="email" name="email" autoComplete="email" required maxLength={254} /></label>
          <label>Piece of interest {!requestDossier && <span>(optional)</span>}
            <select name="piece" required={requestDossier} value={piece} onChange={(event) => setPiece(event.target.value)}>
              {!requestDossier && <option value="">General inquiry</option>}
              {products.map((product) => <option value={product.slug} key={product.slug}>{product.name}</option>)}
            </select>
          </label>
          <label>
            {requestDossier ? <>What would you like to know? <span>(optional)</span></> : 'How can we help?'}
            <textarea name="message" rows={5} required={!requestDossier}
              maxLength={requestDossier ? messageLimit - dossierRequest.length - 2 : messageLimit}
              value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <ConsentCheckbox name="marketingConsent" value="yes">
            Send me occasional notes from the Private List. I can unsubscribe at any time.
          </ConsentCheckbox>
          <div className="contact-page__form-actions">
            <button className="button" type="submit" disabled={sending}>{sending ? 'Sending…' : requestDossier ? 'Request Dossier' : 'Send Inquiry'}</button>
            <a className="concierge-privacy" href="/privacy/">Privacy policy</a>
          </div>
          <div aria-live="polite">
            {result && <p className="concierge-result">{result.message} {result.status === 'unavailable' && <a href={fallbackLink}>Continue by email</a>}</p>}
          </div>
        </form>
      )}
    </section>
  );
}
