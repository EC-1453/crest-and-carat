// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '../src/catalog-types';
import type { Catalog } from '../src/commerce/api';
import { addToBag } from '../src/commerce/bag';
import { ProductPurchase } from '../src/commerce/product-purchase';
import { useCatalog } from '../src/commerce/use-catalog';

vi.mock('../src/commerce/use-catalog', () => ({ useCatalog: vi.fn() }));

const concept: Product = {
  slug: 'test-chain',
  name: 'Test Chain',
  seoTitle: 'Test Chain',
  description: 'Test exact-item approval.',
  materials: '18K solid gold',
  category: 'necklace',
  collections: ['solid-gold'],
  image: { src: '/images/test-chain.webp', alt: 'Test chain', width: 720, height: 540, approved: false },
  featured: false,
  commission: { startingPriceCents: 385_000, engraving: 'Ask about initials.', sizing: 'Ask about length.' },
};

const approved: Product = {
  ...concept,
  image: { ...concept.image, approved: true },
  verifiedDetails: { dimensions: '18 inches', metalPurity: '18K solid gold', availability: 'InStock' },
};

const catalog: Catalog = {
  items: [{
    sku: 'test-chain-18',
    productSlug: concept.slug,
    variantId: '18-inch',
    name: concept.name,
    variantName: '18 inches',
    priceCents: 400_000,
    maxQuantity: 2,
    destinations: ['US'],
    engraving: { minLength: 0, maxLength: 0, pattern: null, required: false, instructions: '', uppercaseOnly: false },
  }],
  shipping: [{ country: 'US', region: 'US', label: 'Insured courier' }],
  processors: [{ id: 'test-provider', label: 'Test payment provider' }],
  termsVersion: 'test-version',
};

const bagLine = { sku: catalog.items[0].sku, quantity: 1, engraving: '' };
const bagKey = 'crest-and-carat.bag.v1';
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(useCatalog).mockReturnValue({ state: { status: 'ready', catalog }, reload: vi.fn() });
  window.localStorage.clear();
  window.sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shows the dossier and indicative price for a design study even if the catalog has a matching SKU', async () => {
  await act(async () => root.render(<ProductPurchase product={concept} />));

  expect(useCatalog).toHaveBeenLastCalledWith(false);
  expect(container.textContent).toContain('$3,850.00 USD');
  expect(container.querySelector('form')).toBeNull();
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/contact/?piece=test-chain&request=dossier');
});

it('offers Acquire Piece only when exact details and live checkout eligibility are both present', async () => {
  await act(async () => root.render(<ProductPurchase product={approved} />));

  expect(useCatalog).toHaveBeenLastCalledWith(true);
  expect(container.querySelector('button')?.textContent).toBe('Acquire Piece');
  expect(container.querySelector('.catalog-price')?.textContent).toBe('$4,000.00 USD');
  expect(container.querySelector('.catalog-price-estimate')).toBeNull();
  expect(container.querySelector('a')?.textContent?.trim()).toBe('Request Private Concierge Dossier');

  vi.mocked(useCatalog).mockReturnValue({
    state: { status: 'ready', catalog: { ...catalog, shipping: [] } },
    reload: vi.fn(),
  });
  await act(async () => root.render(<ProductPurchase product={approved} />));

  expect(container.querySelector('button')).toBeNull();
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/contact/?piece=test-chain&request=dossier');
});

it('leaves the bag unchanged if neither browser store can save the new checkout selection', () => {
  const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage blocked', 'SecurityError');
  });

  expect(addToBag(bagLine, 2, { requirePersistence: true })).toContain('Allow browser storage');
  expect(window.localStorage.getItem(bagKey)).toBeNull();
  expect(window.sessionStorage.getItem(bagKey)).toBeNull();

  blocked.mockRestore();
  expect(addToBag(bagLine, 2, { requirePersistence: true })).toBeUndefined();
  expect(JSON.parse(window.localStorage.getItem(bagKey) ?? 'null')).toEqual([bagLine]);
});

it('uses session storage to carry the order to checkout when local storage is blocked', () => {
  const write = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (this === window.localStorage) throw new DOMException('Storage blocked', 'SecurityError');
    write.call(this, key, value);
  });

  expect(addToBag(bagLine, 2, { requirePersistence: true })).toBeUndefined();
  expect(JSON.parse(window.sessionStorage.getItem(bagKey) ?? 'null')).toEqual([bagLine]);
});
