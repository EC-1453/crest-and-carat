export interface CatalogImage {
  readonly src: string;
  readonly srcSet?: string;
  readonly avifSrcSet?: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly approved: boolean;
}

export interface Collection {
  readonly slug: string;
  readonly name: string;
  readonly seoTitle: string;
  readonly description: string;
  readonly image: CatalogImage;
  readonly featured: boolean;
}

export type ProductCategory = 'necklace' | 'pendant' | 'ring' | 'bracelet' | 'earrings' | 'evening-bag' | 'shawl' | 'accessory';

export type VerifiedStone =
  | { readonly family: 'diamond'; readonly origin: 'natural' | 'lab-grown'; readonly caratWeight: number; readonly description: string; readonly gradingReport?: string }
  | { readonly family: 'pearl'; readonly pearlType: 'freshwater' | 'Akoya' | 'South Sea' | 'Tahitian' | 'other'; readonly description: string }
  | { readonly family: 'moissanite' | 'other'; readonly description: string };

export interface VerifiedProductDetails {
  readonly dimensions: string;
  readonly stone?: VerifiedStone;
}

export interface Product {
  readonly slug: string;
  readonly name: string;
  readonly seoTitle: string;
  readonly description: string;
  readonly materials: string;
  readonly category: ProductCategory;
  readonly collections: readonly string[];
  readonly image: CatalogImage;
  readonly featured: boolean;
  readonly verifiedDetails?: VerifiedProductDetails;
}

export interface PublicCatalog {
  readonly collections: readonly Collection[];
  readonly products: readonly Product[];
}
