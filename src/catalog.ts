import { catalog } from './catalog-data.generated';
import type { Product, PurchasableOffer } from './catalog-types';

export type { CatalogImage, Collection, Product, PurchasableOffer, ShippingZone } from './catalog-types';

export const { collections, products } = catalog;

export function getPurchasableOffer(product: Product): PurchasableOffer | undefined {
  return product.buyAndPersonalizeEnabled && product.image.approved ? product.offer : undefined;
}

export const productPath = (slug: string): string => `/products/${slug}/`;
export const collectionPath = (slug: string): string => `/collections/${slug}/`;

export function validateCatalog(): void {
  const collectionSlugs = new Set(collections.map(({ slug }) => slug));
  for (const product of products) {
    if (!product.collections.length || product.collections.some((slug) => !collectionSlugs.has(slug))) {
      throw new Error(`No valid collection for ${product.slug}`);
    }
    if (product.buyAndPersonalizeEnabled !== Boolean(getPurchasableOffer(product))) {
      throw new Error(`No verified offer for ${product.slug}`);
    }
  }
}
