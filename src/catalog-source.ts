import type { CatalogImage, Collection, Product, PublicCatalog, PurchasableOffer } from './catalog-types';

type FulfillmentMode = 'dropship' | 'supplier-assembly' | 'merchant';

interface Supplier {
  readonly id: string;
  readonly name: string;
  readonly approved: boolean;
}

interface ApprovedDetails {
  readonly description: string;
  readonly materials: string;
  readonly image: CatalogImage;
  readonly production: PurchasableOffer['production'];
  readonly shipping: PurchasableOffer['shipping'];
  readonly availability: PurchasableOffer['availability'];
  readonly availabilityDate?: string;
  readonly sizes: PurchasableOffer['sizes'];
  readonly variants: PurchasableOffer['variants'];
  readonly dimensions: string;
  readonly stone?: PurchasableOffer['stone'];
  readonly surfaces: PurchasableOffer['surfaces'];
  readonly personalizationConfirmed: boolean;
  readonly deliveryConfirmed: boolean;
  readonly assemblyAndSinglePackageConfirmed?: boolean;
  readonly checkoutConfirmed: boolean;
  readonly checkoutOrigin: string;
}

export interface SourceProduct extends Omit<Product, 'offer'> {
  readonly supplier_id: string | null;
  readonly supplier_sku: string | null;
  readonly supplier_sku_verified: boolean;
  readonly fulfillment_mode: FulfillmentMode;
  readonly eligible_destinations: readonly string[];
  readonly supplier_cost_usd: number | null;
  readonly supplier_cost_verified: boolean;
  readonly retail_price_usd: number | null;
  readonly minimum_markup_multiplier: 2;
  readonly planning_price_usd: number;
  readonly approved_details?: ApprovedDetails;
  readonly required_stone?: 'natural-diamond' | 'freshwater-pearl' | 'moissanite';
  readonly personalization_required?: boolean;
}

// This file is used by the build and Pages Functions. Do not import it from browser code.
export const suppliers: readonly Supplier[] = [
  { id: 'stuller', name: 'Stuller', approved: false },
];

function conceptImage(slug: string, alt: string): CatalogImage {
  return {
    src: `/images/${slug}.webp`,
    srcSet: `/images/${slug}-360.webp 360w, /images/${slug}.webp 720w`,
    avifSrcSet: `/images/${slug}-360.avif 360w, /images/${slug}.avif 720w`,
    width: 720,
    height: 540,
    alt,
    approved: false,
  };
}

export const sourceCollections: readonly Collection[] = [
  {
    slug: 'genuine-pearls', name: 'Genuine Pearls', seoTitle: 'Genuine Pearl Jewelry & Bespoke Pearl Gifts', featured: true,
    description: 'Freshwater radiance and the quiet elegance of layered pearls. Explore pearl jewelry ideas and ask our concierge about Akoya and South Sea possibilities.',
    image: conceptImage('genuine-pearls', 'Concept photograph of luminous pearl jewelry against pale limestone'),
  },
  {
    slug: 'solid-gold', name: 'Solid Gold', seoTitle: 'Solid Gold Personalized Jewelry & Engraving', featured: true,
    description: 'Personalized 14K gold necklaces, signets and pendants in intimate silhouettes made for a name, date or place close to you.',
    image: conceptImage('solid-gold', 'Concept photograph of polished solid-gold jewelry on warm neutral stone'),
  },
  {
    slug: 'platinum', name: 'Platinum', seoTitle: 'Bespoke Platinum Jewelry Inquiries', featured: true,
    description: 'Explore the cool luster of platinum through a private consultation for an heirloom, a milestone or an understated everyday piece.',
    image: conceptImage('platinum', 'Concept photograph of a platinum ring on pale stone'),
  },
  {
    slug: 'diamonds', name: 'Diamonds', seoTitle: 'Bespoke Diamond Pendants & Jewelry', featured: true,
    description: 'Discover diamond jewelry concepts, from a single luminous solitaire to a personal commission with room for your own story.',
    image: conceptImage('diamonds', 'Concept photograph of a clear solitaire pendant in a polished metal setting'),
  },
  {
    slug: 'sterling-silver', name: 'Sterling Silver', seoTitle: 'Sterling Silver & Gold Vermeil Jewelry', featured: false,
    description: 'Refined silhouettes in sterling silver and gold vermeil, with clear material details for each piece as specifications are confirmed.',
    image: conceptImage('sterling-silver', 'Concept photograph of a polished silver cuff and band against limestone'),
  },
  {
    slug: 'jeweled-objects-evening-bags', name: 'Jeweled Objects & Evening Bags', seoTitle: 'Jeweled Evening Bags & Couture Accessories', featured: false,
    description: 'Pearl-embellished clutches, crystal accents, couture silk or metallic shawls and heirloom accessories for meaningful evenings.',
    image: conceptImage('jeweled-objects-evening-bags', 'Concept photograph of a pearl-embellished evening clutch'),
  },
];

const pending = {
  supplier_id: null,
  supplier_sku: null,
  supplier_sku_verified: false,
  fulfillment_mode: 'dropship',
  eligible_destinations: [],
  supplier_cost_usd: null,
  supplier_cost_verified: false,
  retail_price_usd: null,
  minimum_markup_multiplier: 2,
  buyAndPersonalizeEnabled: false,
} as const;

export const sourceProducts: readonly SourceProduct[] = [
  {
    ...pending,
    slug: 'the-sovereign', name: 'The Sovereign', seoTitle: 'The Sovereign | 14K Gold Name Necklace', materials: '14K solid gold', featured: true,
    description: 'A personalized name necklace imagined in 14K solid gold. Tell our concierge the name you have in mind, and we can review the available nameplate styles and lettering with you.',
    category: 'necklace', collections: ['solid-gold'],
    image: conceptImage('the-sovereign', 'Concept photograph of a gold nameplate necklace'),
    supplier_id: 'stuller', supplier_sku: '86135:1006:P', planning_price_usd: 279, personalization_required: true,
  },
  {
    ...pending,
    slug: 'the-aurelia', name: 'The Aurelia', seoTitle: 'The Aurelia | Natural Diamond Solitaire Pendant', materials: '14K solid gold and natural diamond concept', featured: true,
    description: 'A pendant concept centered on a single natural diamond in 14K solid gold. Ask about stone weight, grading documentation and setting options as the piece is confirmed.',
    category: 'pendant', collections: ['diamonds', 'solid-gold'],
    image: conceptImage('the-aurelia', 'Concept photograph of a round solitaire pendant on a fine gold chain'),
    planning_price_usd: 489, required_stone: 'natural-diamond',
  },
  {
    ...pending,
    slug: 'the-seraphina', name: 'The Seraphina', seoTitle: 'The Seraphina | Pearl & Engraved Gold Necklace', materials: 'Freshwater pearl and 14K solid gold', featured: true,
    description: 'A freshwater pearl alongside a solid 14K gold disc on a matching chain. Share an initial or meaningful date with our concierge to explore placement and engraving options.',
    category: 'necklace', collections: ['genuine-pearls', 'solid-gold'],
    image: conceptImage('the-seraphina', 'Concept photograph of a pearl and blank gold disc necklace'),
    fulfillment_mode: 'supplier-assembly', planning_price_usd: 329, required_stone: 'freshwater-pearl', personalization_required: true,
  },
  {
    ...pending,
    slug: 'the-monarch', name: 'The Monarch', seoTitle: 'The Monarch | 14K Gold Monogram Signet Ring', materials: '14K solid gold', featured: true,
    description: 'A custom monogram signet ring in solid 14K gold. Discuss the initials you would like to wear and the ring size you have in mind with our concierge.',
    category: 'ring', collections: ['solid-gold'],
    image: conceptImage('the-monarch', 'Concept photograph of a polished gold signet ring on pale stone'),
    planning_price_usd: 369, personalization_required: true,
  },
  {
    ...pending,
    slug: 'the-celeste', name: 'The Celeste', seoTitle: 'The Celeste | Moissanite Tennis Bracelet', materials: 'Moissanite and 18K gold vermeil over sterling silver', featured: false,
    description: 'A moissanite tennis bracelet concept in 18K gold vermeil over sterling silver. The stones are moissanite and the setting is gold-coated sterling silver.',
    category: 'bracelet', collections: ['sterling-silver'],
    image: conceptImage('the-celeste', 'Concept photograph of a moissanite tennis bracelet in gold vermeil'),
    planning_price_usd: 229, required_stone: 'moissanite',
  },
  {
    ...pending,
    slug: 'the-royal-coordinate', name: 'The Royal Coordinate', seoTitle: 'The Royal Coordinate | 14K Gold Coordinate Necklace', materials: '14K solid gold', featured: false,
    description: 'A solid 14K gold necklace for the coordinates of a place close to you. Ask our concierge about available engraving surfaces and how the coordinates can be arranged.',
    category: 'necklace', collections: ['solid-gold'],
    image: conceptImage('the-royal-coordinate', 'Concept photograph of a round gold coordinate medallion on a fine chain'),
    planning_price_usd: 249, personalization_required: true,
  },
];

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const countryPattern = /^[A-Z]{2}$/u;

function moneyCents(value: number | null): number | undefined {
  if (value === null || value < 0 || value !== Number(value.toFixed(2))) return undefined;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : undefined;
}

function validDays({ minBusinessDays, maxBusinessDays }: PurchasableOffer['production']): boolean {
  return Number.isSafeInteger(minBusinessDays) && Number.isSafeInteger(maxBusinessDays)
    && minBusinessDays >= 0 && maxBusinessDays >= minBusinessDays;
}

function validOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && value === url.origin;
  } catch {
    return false;
  }
}

function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validOptions(options: readonly { id: string; label: string }[]): boolean {
  return new Set(options.map(({ id }) => id)).size === options.length
    && options.every(({ id, label }) => slugPattern.test(id) && Boolean(label.trim()));
}

function publicImage({ src, srcSet, avifSrcSet, width, height, alt, approved }: CatalogImage): CatalogImage {
  return { src, width, height, alt, approved, ...(srcSet ? { srcSet } : {}), ...(avifSrcSet ? { avifSrcSet } : {}) };
}

function validImagePath(path: string): boolean {
  return /^\/images\/[a-z0-9][a-z0-9._/-]*\.(?:webp|avif|png|jpe?g)$/iu.test(path)
    && !path.split('/').some((segment) => segment === '.' || segment === '..');
}

function validSrcSet(srcSet: string | undefined): boolean {
  return srcSet === undefined || srcSet.split(',').every((source) => {
    const [path, width, extra] = source.trim().split(/\s+/u);
    return !extra && validImagePath(path ?? '') && /^[1-9][0-9]*w$/u.test(width ?? '');
  });
}

function publicStone(stone: NonNullable<PurchasableOffer['stone']>): NonNullable<PurchasableOffer['stone']> {
  const { family, description } = stone;
  if (family === 'diamond') {
    const { origin, caratWeight, gradingReport } = stone;
    return { family, description, origin, caratWeight, ...(gradingReport ? { gradingReport } : {}) };
  }
  if (family === 'pearl') return { family, description, pearlType: stone.pearlType };
  return { family, description };
}

function validStone(product: SourceProduct, stone: PurchasableOffer['stone']): boolean {
  if (product.required_stone === 'natural-diamond' && !(stone?.family === 'diamond' && stone.origin === 'natural')) return false;
  if (product.required_stone === 'freshwater-pearl' && !(stone?.family === 'pearl' && stone.pearlType === 'freshwater')) return false;
  if (product.required_stone === 'moissanite' && stone?.family !== 'moissanite') return false;
  if (product.collections.includes('diamonds') && stone?.family !== 'diamond') return false;
  if (product.collections.includes('genuine-pearls') && stone?.family !== 'pearl') return false;
  return !stone || Boolean(stone.description.trim())
    && (stone.family !== 'diamond' || (Number.isFinite(stone.caratWeight) && stone.caratWeight > 0));
}

function approvedOffer(product: SourceProduct, currentSuppliers: readonly Supplier[]): PurchasableOffer {
  const reject = (reason: string): never => { throw new Error(`Catalog ${product.slug}: ${reason}`); };
  const details = product.approved_details;
  const exactSupplier = currentSuppliers.find(({ id }) => id === product.supplier_id);
  if (!exactSupplier?.approved || !product.supplier_sku?.trim() || !product.supplier_sku_verified) {
    reject('purchase requires an approved supplier and a verified exact SKU');
  }

  const cost = moneyCents(product.supplier_cost_usd);
  const price = moneyCents(product.retail_price_usd);
  if (cost === undefined || cost <= 0 || cost > Number.MAX_SAFE_INTEGER / 2 || !product.supplier_cost_verified
    || price === undefined || price < cost * product.minimum_markup_multiplier || product.minimum_markup_multiplier !== 2) {
    reject('purchase requires a verified supplier cost and an approved retail price at least twice that cost');
  }

  if (!details || !details.image.approved || !details.description.trim() || !details.materials.trim() || !details.dimensions.trim()) {
    throw new Error(`Catalog ${product.slug}: purchase requires approved exact-item imagery and confirmed public specifications`);
  }
  if (!validImagePath(details.image.src) || !validSrcSet(details.image.srcSet) || !validSrcSet(details.image.avifSrcSet) || !details.image.alt.trim()
    || !Number.isSafeInteger(details.image.width) || details.image.width <= 0
    || !Number.isSafeInteger(details.image.height) || details.image.height <= 0
    || details.image.src === product.image.src) {
    reject('approved imagery must identify a distinct exact-item image served by the storefront');
  }
  if (product.fulfillment_mode === 'supplier-assembly' && !details.assemblyAndSinglePackageConfirmed) {
    reject('purchase requires confirmed assembly and single-package shipping');
  }
  if (!details.personalizationConfirmed || !validOptions(details.sizes) || !validOptions(details.variants)
    || (product.personalization_required && !details.surfaces.length)
    || (product.category === 'ring' && !details.sizes.length) || !validOptions(details.surfaces)
    || details.surfaces.some((surface) => !Number.isSafeInteger(surface.minCharacters) || surface.minCharacters < 1
      || !Number.isSafeInteger(surface.maxCharacters) || surface.maxCharacters > 160 || surface.maxCharacters < surface.minCharacters
      || !surface.instructions.trim() || !validOptions(surface.fonts)
      || surface.fonts.some(({ previewCssClass }) => previewCssClass && !slugPattern.test(previewCssClass))
      || (!surface.allowDigits && !surface.allowLetters && !surface.extraCharacters.length))) {
    reject('purchase requires confirmed sizing, variants and personalization rules');
  }
  if (!validStone(product, details.stone)) reject('stone details are incomplete or conflict with the item description');

  const countries = product.eligible_destinations;
  const covered = details.shipping.flatMap(({ destinations }) => destinations);
  if (!details.deliveryConfirmed || !validDays(details.production) || !countries.length || countries.some((country) => !countryPattern.test(country))
    || new Set(countries).size !== countries.length || new Set(covered).size !== covered.length || covered.length !== countries.length
    || !countries.every((country) => covered.includes(country))
    || details.shipping.some((zone) => !zone.name.trim() || !zone.destinations.length || !zone.insured || !validDays(zone) || moneyCents(zone.rateUsd) === undefined)) {
    reject('purchase requires confirmed production and insured shipping terms for each eligible destination');
  }
  if (!details.checkoutConfirmed || !validOrigin(details.checkoutOrigin)) reject('purchase requires an active, approved HTTPS hosted checkout');
  if (details.availability === 'PreOrder' && !validDate(details.availabilityDate)) reject('preorders require a confirmed ISO availability date');

  return {
    priceUsd: Number(product.retail_price_usd), currency: 'USD', eligibleDestinations: countries,
    production: { minBusinessDays: details.production.minBusinessDays, maxBusinessDays: details.production.maxBusinessDays },
    shipping: details.shipping.map(({ name, destinations, rateUsd, minBusinessDays, maxBusinessDays, insured, signatureRequired }) => ({
      name, destinations, rateUsd, minBusinessDays, maxBusinessDays, insured, signatureRequired,
    })),
    availability: details.availability,
    sizes: details.sizes.map(({ id, label }) => ({ id, label })),
    variants: details.variants.map(({ id, label }) => ({ id, label })),
    dimensions: details.dimensions,
    surfaces: details.surfaces.map(({ id, label, minCharacters, maxCharacters, allowLetters, allowDigits, extraCharacters, uppercaseOnly, coordinateFormat, fonts, instructions }) => ({
      id, label, minCharacters, maxCharacters, allowLetters, allowDigits, extraCharacters, instructions,
      ...(uppercaseOnly ? { uppercaseOnly } : {}), ...(coordinateFormat ? { coordinateFormat } : {}),
      fonts: fonts.map(({ id: fontId, label: fontLabel, previewCssClass }) => ({ id: fontId, label: fontLabel, ...(previewCssClass ? { previewCssClass } : {}) })),
    })),
    ...(details.stone ? { stone: publicStone(details.stone) } : {}),
    ...(details.availability === 'PreOrder' && validDate(details.availabilityDate) ? { availabilityDate: details.availabilityDate } : {}),
    checkoutOrigin: details.checkoutOrigin,
  };
}

export function compileCatalog(
  currentProducts: readonly SourceProduct[] = sourceProducts,
  currentSuppliers: readonly Supplier[] = suppliers,
  currentCollections: readonly Collection[] = sourceCollections,
): PublicCatalog {
  if (!validOptions(currentSuppliers.map(({ id, name }) => ({ id, label: name })))) throw new Error('Catalog supplier IDs must be unique slugs');
  if (!validOptions(currentCollections.map(({ slug, name }) => ({ id: slug, label: name })))) throw new Error('Catalog collection slugs must be unique');
  if (!validOptions(currentProducts.map(({ slug, name }) => ({ id: slug, label: name })))) throw new Error('Catalog product slugs must be unique');
  const collectionSlugs = new Set(currentCollections.map(({ slug }) => slug));
  const publicProducts = currentProducts.map((product): Product => {
    if (!product.collections.length || product.collections.some((slug) => !collectionSlugs.has(slug))) {
      throw new Error(`Catalog ${product.slug}: requires a valid collection`);
    }
    const offer = product.buyAndPersonalizeEnabled ? approvedOffer(product, currentSuppliers) : undefined;
    const details = offer ? product.approved_details : undefined;
    return {
      slug: product.slug, name: product.name, seoTitle: product.seoTitle, description: details?.description ?? product.description,
      materials: details?.materials ?? product.materials, category: product.category, collections: product.collections,
      image: publicImage(details?.image ?? product.image), featured: product.featured,
      buyAndPersonalizeEnabled: Boolean(offer), ...(offer ? { offer } : {}),
    };
  });
  return {
    collections: currentCollections.map(({ slug, name, seoTitle, description, image, featured }) =>
      ({ slug, name, seoTitle, description, image: publicImage(image), featured })),
    products: publicProducts,
  };
}
