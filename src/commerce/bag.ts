import { useSyncExternalStore } from 'react';
import type { BagLine } from './api';
import { record } from './http';

const storageKey = 'crest-and-carat.bag.v1';
const emptyBag: readonly BagLine[] = [];
const listeners = new Set<() => void>();
let currentBag = emptyBag;
let currentValue: string | null = null;
let memoryOnly = false;

export const MAX_BAG_LINES = 20;

function isBagLine(value: unknown): value is BagLine {
  return record(value) && typeof value.sku === 'string' && value.sku.length > 0 && value.sku.length <= 100
    && typeof value.quantity === 'number' && Number.isSafeInteger(value.quantity) && value.quantity > 0 && value.quantity <= 100
    && typeof value.engraving === 'string' && value.engraving.length <= 320;
}

function decodeBag(value: string | null): readonly BagLine[] {
  if (!value || value.length > 24_000) return emptyBag;
  try {
    const data: unknown = JSON.parse(value);
    return Array.isArray(data) ? data.filter(isBagLine).slice(0, MAX_BAG_LINES) : emptyBag;
  } catch {
    return emptyBag;
  }
}

function getBag(): readonly BagLine[] {
  if (memoryOnly) return currentBag;
  let fallback: string | null = null;
  try { fallback = window.sessionStorage.getItem(storageKey); } catch { /* Try first-party local storage. */ }
  let value = fallback;
  try {
    value ??= window.localStorage.getItem(storageKey);
  } catch {
    // Session storage can still keep the bag available in this tab.
  }
  if (value !== currentValue) {
    currentValue = value;
    currentBag = decodeBag(value);
  }
  return currentBag;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const sync = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) listener();
  };
  window.addEventListener('storage', sync);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', sync);
  };
}

function storeBag(items: readonly BagLine[]) {
  currentBag = items;
  const encoded = JSON.stringify(items);
  try {
    window.localStorage.setItem(storageKey, encoded);
    currentValue = encoded;
    try { window.sessionStorage.removeItem(storageKey); } catch { /* Local storage holds the current bag. */ }
  } catch {
    try {
      window.sessionStorage.setItem(storageKey, encoded);
      currentValue = encoded;
    } catch {
      memoryOnly = true;
    }
  }
  listeners.forEach((listener) => listener());
}

function equalLine(a: BagLine, b: BagLine): boolean {
  return a.sku === b.sku && a.engraving === b.engraving;
}

export function useBag(): readonly BagLine[] {
  return useSyncExternalStore(subscribe, getBag, () => emptyBag);
}

export function addToBag(line: BagLine, maxQuantity: number): string | undefined {
  const bag = getBag();
  const match = bag.findIndex((item) => equalLine(item, line));
  const skuQuantity = bag.reduce((total, item) => total + (item.sku === line.sku ? item.quantity : 0), 0);
  if (skuQuantity + line.quantity > maxQuantity) return `You can order up to ${maxQuantity} of this option at once.`;
  if (match === -1) {
    if (bag.length >= MAX_BAG_LINES) return 'Your bag has reached its limit. Review your pieces before adding more.';
    storeBag([...bag, line]);
  } else {
    storeBag(bag.map((item, index) => index === match ? { ...item, quantity: item.quantity + line.quantity } : item));
  }
}

export function updateBag(line: BagLine, quantity: number, maxQuantity: number): string | undefined {
  const bag = getBag();
  const match = bag.findIndex((item) => equalLine(item, line));
  if (match === -1) return;
  const otherQuantity = bag.reduce((total, item, index) => total + (index !== match && item.sku === line.sku ? item.quantity : 0), 0);
  if (quantity + otherQuantity > maxQuantity) return `You can order up to ${maxQuantity} of this option at once.`;
  storeBag(quantity === 0 ? bag.filter((_, index) => index !== match) : bag.map((item, index) => index === match ? { ...item, quantity } : item));
}

export function changeBagEngraving(line: BagLine, engraving: string) {
  if (line.engraving === engraving) return;
  const bag = getBag();
  const match = bag.findIndex((item) => equalLine(item, line));
  if (match === -1) return;
  const combined = bag.findIndex((item) => item.sku === line.sku && item.engraving === engraving);
  const updated = bag.flatMap((item, index) => {
    if (index === match) return combined === -1 ? [{ ...item, engraving }] : [];
    return [index === combined ? { ...item, quantity: item.quantity + bag[match].quantity } : item];
  });
  storeBag(updated);
}

export function clearOrderedLines(orderedLines: readonly BagLine[]) {
  const remaining = getBag().flatMap((item) => {
    const ordered = orderedLines.find((line) => equalLine(line, item));
    const quantity = item.quantity - (ordered?.quantity ?? 0);
    return quantity > 0 ? [{ ...item, quantity }] : [];
  });
  storeBag(remaining);
}
