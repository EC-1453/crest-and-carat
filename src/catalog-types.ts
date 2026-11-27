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
  readonly tier?: 'high-jewelry';
}

export type ProductCategory = 'necklace' | 'pendant' | 'ring' | 'bracelet' | 'earrings' | 'evening-bag' | 'shawl' | 'accessory';

interface VerifiedStoneReport {
  readonly geographicalOrigin?: string;
  readonly gradingLab?: string;
  readonly gradingReport?: string;
}

interface VerifiedFacetedStone extends VerifiedStoneReport {
  readonly origin: 'natural' | 'lab-grown';
  readonly caratWeight: number;
  readonly colorGrade?: string;
  readonly clarityGrade?: string;
  readonly description: string;
}

export type VerifiedStone =
  | (VerifiedFacetedStone & { readonly family: 'diamond' })
  | (VerifiedFacetedStone & { readonly family: 'ruby' | 'emerald' | 'sapphire'; readonly colorGrade: string })
  | (VerifiedStoneReport & {
    readonly family: 'pearl';
    readonly pearlType: 'freshwater' | 'Akoya' | 'South Sea' | 'Tahitian' | 'other';
    readonly origin?: 'cultured' | 'natural';
    readonly diameterMm?: string;
    readonly colorGrade?: string;
    readonly description: string;
  })
  | { readonly family: 'moissanite'; readonly description: string }
  | { readonly family: 'other'; readonly description: string };

export interface VerifiedProductDetails {
  readonly dimensions: string;
  readonly metalPurity?: string;
  readonly stone?: VerifiedStone;
  readonly availability?: 'InStock';
}

export interface CommissionDetails {
  readonly startingPriceCents?: number;
  readonly engraving: string;
  readonly sizing: string;
  readonly stone?: {
    readonly name: string;
    readonly caratWeight?: string;
    readonly origin?: string;
    readonly grade?: string;
    readonly report?: string;
  };
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
  readonly tier?: 'high-jewelry';
  readonly commission?: CommissionDetails;
  readonly verifiedDetails?: VerifiedProductDetails;
}

export interface PublicCatalog {
  readonly collections: readonly Collection[];
  readonly products: readonly Product[];
}

export interface PrerenderedOffer {
  readonly productSlug: string;
  readonly variantName: string;
  readonly priceCents: number;
}
