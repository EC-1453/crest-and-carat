import { catalog } from './catalog-data.generated';

export type { CatalogImage, Collection, Product } from './catalog-types';

export const { collections, products } = catalog;

export const productPath = (slug: string): string => `/products/${slug}/`;
export const collectionPath = (slug: string): string => `/collections/${slug}/`;
