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

export interface ShippingZone {
  readonly name: string;
  readonly destinations: readonly string[];
  readonly rateUsd: number;
  readonly minBusinessDays: number;
  readonly maxBusinessDays: number;
  readonly insured: true;
  readonly signatureRequired: boolean;
}

export interface AvailableOption {
  readonly id: string;
  readonly label: string;
}

export interface EngravingFont extends AvailableOption {
  readonly previewCssClass?: string;
}

export interface EngravingSurface extends AvailableOption {
  readonly minCharacters: number;
  readonly maxCharacters: number;
  readonly allowLetters: boolean;
  readonly allowDigits: boolean;
  readonly extraCharacters: string;
  readonly uppercaseOnly?: boolean;
  readonly coordinateFormat?: 'decimal';
  readonly fonts: readonly EngravingFont[];
  readonly instructions: string;
}

export type VerifiedStone =
  | { readonly family: 'diamond'; readonly origin: 'natural' | 'lab-grown'; readonly caratWeight: number; readonly description: string; readonly gradingReport?: string }
  | { readonly family: 'pearl'; readonly pearlType: 'freshwater' | 'Akoya' | 'South Sea' | 'Tahitian' | 'other'; readonly description: string }
  | { readonly family: 'moissanite' | 'other'; readonly description: string };

export interface PurchasableOffer {
  readonly priceUsd: number;
  readonly currency: 'USD';
  readonly eligibleDestinations: readonly string[];
  readonly production: { readonly minBusinessDays: number; readonly maxBusinessDays: number };
  readonly shipping: readonly ShippingZone[];
  readonly availability: 'InStock' | 'PreOrder' | 'MadeToOrder';
  readonly availabilityDate?: string;
  readonly sizes: readonly AvailableOption[];
  readonly variants: readonly AvailableOption[];
  readonly dimensions: string;
  readonly stone?: VerifiedStone;
  readonly surfaces: readonly EngravingSurface[];
  readonly checkoutOrigin: string;
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
  readonly buyAndPersonalizeEnabled: boolean;
  readonly offer?: PurchasableOffer;
}

export interface PublicCatalog {
  readonly collections: readonly Collection[];
  readonly products: readonly Product[];
}
