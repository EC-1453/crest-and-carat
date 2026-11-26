import { Capacitor } from '@capacitor/core';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallState = 'manual' | 'ready' | 'installed';

const productionOrigin = 'https://carat.evercrest.vip';
const deepLinkPath = /^\/(?:shop|app|(?:collections|products)\/[a-z0-9-]+)\/?$/;
const nativeLaunchKey = 'crest-carat-native-launch-handled';
const installListeners = new Set<() => void>();
let deferredPrompt: InstallPromptEvent | undefined;
let installedThisSession = false;

function notifyInstallListeners() {
  installListeners.forEach((listener) => listener());
}

function captureInstallPrompt(event: Event) {
  event.preventDefault();
  deferredPrompt = event as InstallPromptEvent;
  notifyInstallListeners();
}

function markAppInstalled() {
  deferredPrompt = undefined;
  installedThisSession = true;
  notifyInstallListeners();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', captureInstallPrompt);
  window.addEventListener('appinstalled', markAppInstalled);

  import.meta.hot?.dispose(() => {
    window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
    window.removeEventListener('appinstalled', markAppInstalled);
  });
}

function subscribeToInstallState(listener: () => void) {
  installListeners.add(listener);
  const displayMode = window.matchMedia?.('(display-mode: standalone)');
  if (displayMode?.addEventListener) displayMode.addEventListener('change', listener);
  else displayMode?.addListener?.(listener);

  return () => {
    installListeners.delete(listener);
    if (displayMode?.removeEventListener) displayMode.removeEventListener('change', listener);
    else displayMode?.removeListener?.(listener);
  };
}

function getInstallState(): InstallState {
  const safariNavigator: Navigator & { standalone?: boolean } = navigator;
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || safariNavigator.standalone;
  if (Capacitor.isNativePlatform() || installedThisSession || standalone) return 'installed';
  return deferredPrompt ? 'ready' : 'manual';
}

function getServerInstallState(): InstallState {
  return 'manual';
}

function approvedStoreUrl(value: string | undefined, host: string, matchesListing: (url: URL) => boolean): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.host === host && !url.username && !url.password && matchesListing(url)) {
      return url.href;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export const iosAppStoreUrl = approvedStoreUrl(import.meta.env.VITE_IOS_APP_STORE_URL, 'apps.apple.com',
  (url) => /\/id\d+\/?$/.test(url.pathname));
export const googlePlayUrl = approvedStoreUrl(import.meta.env.VITE_GOOGLE_PLAY_URL, 'play.google.com',
  (url) => /^\/store\/apps\/details\/?$/.test(url.pathname) && url.searchParams.get('id') === 'vip.evercrest.carat');

function installHelp() {
  const agent = navigator.userAgent;
  const isAppleMobile = /iPhone|iPad|iPod/i.test(agent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isAppleMobile) return 'Open this page in Safari. Tap Share, then Add to Home Screen. If you see Open as Web App, leave it on, then tap Add.';
  if (/Android/i.test(agent)) return 'Open your browser’s menu. Choose Install app or Add to Home screen, then follow the prompts.';
  if (/Macintosh/i.test(agent) && /Safari/i.test(agent) && !/Chrom(?:e|ium)|Edg|OPR/i.test(agent)) {
    return 'In Safari on a supported Mac, choose File, then Add to Dock.';
  }
  return 'Open your browser’s menu and look for Install or Add to Home Screen. Availability depends on your browser.';
}

export function AppDownload({ compact = false }: { compact?: boolean }) {
  const state = useSyncExternalStore(subscribeToInstallState, getInstallState, getServerInstallState);
  const [help, setHelp] = useState('');
  const [status, setStatus] = useState('');
  const titleId = useId();
  const helpId = useId();
  const Heading = compact ? 'h2' : 'h1';

  async function install() {
    if (!deferredPrompt) {
      setHelp((current) => current ? '' : installHelp());
      return;
    }

    const prompt = deferredPrompt;
    deferredPrompt = undefined;
    setHelp('');
    setStatus('');
    notifyInstallListeners();

    try {
      await prompt.prompt();
      if ((await prompt.userChoice).outcome === 'accepted') setStatus('Follow your device’s instructions to finish installing.');
    } catch {
      setHelp(installHelp());
    }
  }

  return (
    <section className={`app-download${compact ? ' app-download--compact' : ''}`} aria-labelledby={titleId}>
      <div className="app-download__copy">
        <Heading id={titleId}>The Crest &amp; Carat Private App</Heading>
        <p>Keep the collection and Private Client Concierge close at hand.</p>
      </div>
      <div className="app-download__actions">
        {state === 'installed' ? (
          <p role="status">The private app is installed.</p>
        ) : (
          <button
            className="button"
            type="button"
            onClick={() => void install()}
            aria-expanded={state === 'manual' ? Boolean(help) : undefined}
            aria-controls={state === 'manual' ? helpId : undefined}
          >
            Install the app
          </button>
        )}
        {iosAppStoreUrl && <a className="button button--secondary" href={iosAppStoreUrl} rel="noopener noreferrer" target="_blank">Download on the App Store</a>}
        {googlePlayUrl && <a className="button button--secondary" href={googlePlayUrl} rel="noopener noreferrer" target="_blank">Get it on Google Play</a>}
      </div>
      <p className="app-install-help" id={helpId} hidden={!help || state === 'installed'}>{help}</p>
      {state !== 'installed' && status && <p className="app-install-help" role="status">{status}</p>}
    </section>
  );
}

function routeNativeLink(link: string) {
  try {
    const url = new URL(link);
    if (url.origin !== productionOrigin || !deepLinkPath.test(url.pathname)) return;

    const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
    const target = new URL(`${path}${url.search}${url.hash}`, window.location.href);
    if (target.href !== window.location.href) window.location.assign(target.href);
  } catch {
    // A malformed deep link leaves the current page open.
  }
}

function shouldCheckNativeLaunch() {
  try {
    if (sessionStorage.getItem(nativeLaunchKey)) return false;
    sessionStorage.setItem(nativeLaunchKey, '1');
    return true;
  } catch {
    return !document.referrer;
  }
}

export function PwaRegistration() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let active = true;
      const handle = import('@capacitor/app').then(async ({ App }) => {
        const listener = await App.addListener('appUrlOpen', ({ url }) => {
          if (active) routeNativeLink(url);
        });
        if (active && shouldCheckNativeLaunch()) {
          void App.getLaunchUrl().then((launch) => {
            if (active && launch?.url) routeNativeLink(launch.url);
          }).catch(() => undefined);
        }
        return listener;
      });
      void handle.catch(() => undefined);

      return () => {
        active = false;
        void handle.then((listener) => listener.remove()).catch(() => undefined);
      };
    }

    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}

export async function openCheckout(url: string): Promise<void> {
  const destination = new URL(url);
  if (destination.protocol !== 'https:' || destination.username || destination.password) {
    throw new Error('A secure checkout link is required.');
  }

  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: destination.href });
  } else {
    window.location.assign(destination.href);
  }
}
