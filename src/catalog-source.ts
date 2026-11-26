import type { CatalogImage, Collection, Product, PublicCatalog, VerifiedProductDetails, VerifiedStone } from './catalog-types';

interface SourceProduct extends Omit<Product, 'verifiedDetails'> {
  readonly approved_details?: VerifiedProductDetails & { readonly description: string; readonly materials: string; readonly image: CatalogImage };
  readonly required_stone?: 'natural-diamond' | 'freshwater-pearl' | 'moissanite';
}

// Editorial descriptions and imagery are static. The Worker controls which SKUs can be purchased.
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

export const sourceProducts: readonly SourceProduct[] = [
  {
    slug: 'the-sovereign', name: 'The Sovereign', seoTitle: 'The Sovereign | 14K Gold Name Necklace', materials: '14K solid gold', featured: true,
    description: 'A personalized name necklace imagined in 14K solid gold. Tell our concierge the name you have in mind, and we can review the available nameplate styles and lettering with you.',
    category: 'necklace', collections: ['solid-gold'],
    image: conceptImage('the-sovereign', 'Concept photograph of a gold nameplate necklace'),
  },
  {
    slug: 'the-aurelia', name: 'The Aurelia', seoTitle: 'The Aurelia | Natural Diamond Solitaire Pendant', materials: '14K solid gold and natural diamond concept', featured: true,
    description: 'A pendant concept centered on a single natural diamond in 14K solid gold. Ask about stone weight, grading documentation and setting options as the piece is confirmed.',
    category: 'pendant', collections: ['diamonds', 'solid-gold'],
    image: conceptImage('the-aurelia', 'Concept photograph of a round solitaire pendant on a fine gold chain'),
    required_stone: 'natural-diamond',
  },
  {
    slug: 'the-seraphina', name: 'The Seraphina', seoTitle: 'The Seraphina | Pearl & Engraved Gold Necklace', materials: 'Freshwater pearl and 14K solid gold', featured: true,
    description: 'A freshwater pearl alongside a solid 14K gold disc on a matching chain. Share an initial or meaningful date with our concierge to explore placement and engraving options.',
    category: 'necklace', collections: ['genuine-pearls', 'solid-gold'],
    image: conceptImage('the-seraphina', 'Concept photograph of a pearl and blank gold disc necklace'),
    required_stone: 'freshwater-pearl',
  },
  {
    slug: 'the-monarch', name: 'The Monarch', seoTitle: 'The Monarch | 14K Gold Monogram Signet Ring', materials: '14K solid gold', featured: true,
    description: 'A custom monogram signet ring in solid 14K gold. Discuss the initials you would like to wear and the ring size you have in mind with our concierge.',
    category: 'ring', collections: ['solid-gold'],
    image: conceptImage('the-monarch', 'Concept photograph of a polished gold signet ring on pale stone'),
  },
  {
    slug: 'the-celeste', name: 'The Celeste', seoTitle: 'The Celeste | Moissanite Tennis Bracelet', materials: 'Moissanite and 18K gold vermeil over sterling silver', featured: false,
    description: 'A moissanite tennis bracelet concept in 18K gold vermeil over sterling silver. The stones are moissanite and the setting is gold-coated sterling silver.',
    category: 'bracelet', collections: ['sterling-silver'],
    image: conceptImage('the-celeste', 'Concept photograph of a moissanite tennis bracelet in gold vermeil'),
    required_stone: 'moissanite',
  },
  {
    slug: 'the-royal-coordinate', name: 'The Royal Coordinate', seoTitle: 'The Royal Coordinate | 14K Gold Coordinate Necklace', materials: '14K solid gold', featured: false,
    description: 'A solid 14K gold necklace for the coordinates of a place close to you. Ask our concierge about available engraving surfaces and how the coordinates can be arranged.',
    category: 'necklace', collections: ['solid-gold'],
    image: conceptImage('the-royal-coordinate', 'Concept photograph of a round gold coordinate medallion on a fine chain'),
  },
];

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

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

function publicStone(stone: VerifiedStone): VerifiedStone {
  const { family, description } = stone;
  if (family === 'diamond') {
    const { origin, caratWeight, gradingReport } = stone;
    return { family, description, origin, caratWeight, ...(gradingReport ? { gradingReport } : {}) };
  }
  if (family === 'pearl') return { family, description, pearlType: stone.pearlType };
  return { family, description };
}

function validStone(product: SourceProduct, stone: VerifiedStone | undefined): boolean {
  if (product.required_stone === 'natural-diamond' && !(stone?.family === 'diamond' && stone.origin === 'natural')) return false;
  if (product.required_stone === 'freshwater-pearl' && !(stone?.family === 'pearl' && stone.pearlType === 'freshwater')) return false;
  if (product.required_stone === 'moissanite' && stone?.family !== 'moissanite') return false;
  if (product.collections.includes('diamonds') && stone?.family !== 'diamond') return false;
  if (product.collections.includes('genuine-pearls') && stone?.family !== 'pearl') return false;
  return !stone || Boolean(stone.description.trim())
    && (stone.family !== 'diamond' || (Number.isFinite(stone.caratWeight) && stone.caratWeight > 0));
}

function verifiedDetails(product: SourceProduct): VerifiedProductDetails | undefined {
  const details = product.approved_details;
  if (!details) return;
  const { image, description, materials, dimensions, stone } = details;
  if (!image.approved || !description.trim() || !materials.trim() || !dimensions.trim()) {
    throw new Error(`Catalog ${product.slug}: approved details require exact-item imagery and confirmed specifications`);
  }
  if (!validImagePath(image.src) || !validSrcSet(image.srcSet) || !validSrcSet(image.avifSrcSet) || !image.alt.trim()
    || !Number.isSafeInteger(image.width) || image.width <= 0 || !Number.isSafeInteger(image.height) || image.height <= 0
    || image.src === product.image.src) {
    throw new Error(`Catalog ${product.slug}: approved imagery must identify a distinct exact-item image served by the storefront`);
  }
  if (!validStone(product, stone)) throw new Error(`Catalog ${product.slug}: stone details are incomplete or conflict with the item description`);
  return { dimensions, ...(stone ? { stone: publicStone(stone) } : {}) };
}

export function compileCatalog(
  currentProducts: readonly SourceProduct[] = sourceProducts,
  currentCollections: readonly Collection[] = sourceCollections,
): PublicCatalog {
  if (!validOptions(currentCollections.map(({ slug, name }) => ({ id: slug, label: name })))) throw new Error('Catalog collection slugs must be unique');
  if (!validOptions(currentProducts.map(({ slug, name }) => ({ id: slug, label: name })))) throw new Error('Catalog product slugs must be unique');
  const collectionSlugs = new Set(currentCollections.map(({ slug }) => slug));
  const publicProducts = currentProducts.map((product): Product => {
    if (!product.collections.length || product.collections.some((slug) => !collectionSlugs.has(slug))) {
      throw new Error(`Catalog ${product.slug}: requires a valid collection`);
    }
    const specs = verifiedDetails(product);
    const details = specs ? product.approved_details : undefined;
    return {
      slug: product.slug, name: product.name, seoTitle: product.seoTitle, description: details?.description ?? product.description,
      materials: details?.materials ?? product.materials, category: product.category, collections: product.collections,
      image: publicImage(details?.image ?? { ...product.image, approved: false }), featured: product.featured,
      ...(specs ? { verifiedDetails: specs } : {}),
    };
  });
  return {
    collections: currentCollections.map(({ slug, name, seoTitle, description, image, featured }) =>
      ({ slug, name, seoTitle, description, image: publicImage(image), featured })),
    products: publicProducts,
  };
}
