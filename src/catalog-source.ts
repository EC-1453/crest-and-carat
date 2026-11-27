import type { CatalogImage, Collection, Product, PublicCatalog, VerifiedProductDetails, VerifiedStone } from './catalog-types';

type RequiredStone = 'natural-diamond' | 'natural-ruby' | 'natural-emerald' | 'natural-sapphire'
  | 'freshwater-pearl' | 'south-sea-pearl' | 'akoya-pearl' | 'moissanite';

interface SourceProduct extends Omit<Product, 'verifiedDetails'> {
  readonly approved_details?: VerifiedProductDetails & { readonly description: string; readonly materials: string; readonly image: CatalogImage };
  readonly required_stone?: RequiredStone;
  readonly required_report_lab?: 'GIA';
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
  {
    slug: 'precious-gold-heirlooms', name: 'Precious Gold Heirlooms', seoTitle: '18K & 22K Solid Gold Heirloom Jewelry', featured: false, tier: 'high-jewelry',
    description: 'Explore bespoke 18K and 22K solid gold commissions, from hand-finished heirloom chains to sculptural cuffs with a private inscription.',
    image: conceptImage('the-empire-cuff', 'Design study for a wide brushed yellow-gold cuff'),
  },
  {
    slug: 'natural-diamond-high-jewelry', name: 'Natural Diamond High Jewelry', seoTitle: 'Natural Diamond Solitaires & Rivière Necklaces', featured: false, tier: 'high-jewelry',
    description: 'Commission a natural diamond solitaire or a graduated rivière. Review stone selection, grading documentation, and the final setting with the concierge.',
    image: conceptImage('the-lumiere-riviere', 'Design study for a graduated diamond rivière necklace'),
  },
  {
    slug: 'precious-gemstones', name: 'Precious Gemstones', seoTitle: 'Bespoke Ruby, Emerald & Sapphire High Jewelry', featured: false, tier: 'high-jewelry',
    description: 'Three commissions explore natural ruby, emerald, and sapphire. Discuss color, sourcing, and stone treatment disclosures before selecting the final gem.',
    image: conceptImage('the-verde-emerald', 'Design study for a rectangular green emerald ring'),
  },
  {
    slug: 'pearl-high-jewelry', name: 'Pearl High Jewelry', seoTitle: 'South Sea & Akoya Pearl High Jewelry', featured: false, tier: 'high-jewelry',
    description: 'Golden South Sea drops and a white Akoya strand celebrate the distinct luster of each cultured pearl. Commission a matched selection and a clasp in solid 18K gold.',
    image: conceptImage('the-solstice-south-sea', 'Design study for golden South Sea pearl drop earrings'),
  },
];

export const sourceProducts: readonly SourceProduct[] = [
  {
    slug: 'the-sovereign', name: 'The Sovereign', seoTitle: 'The Sovereign | 14K Gold Name Necklace', materials: '14K solid gold', featured: true,
    description: 'A personalized name necklace imagined in 14K solid gold. Tell our concierge the name you have in mind, and we can review the available nameplate styles and lettering with you.',
    category: 'necklace', collections: ['solid-gold'],
    image: conceptImage('the-sovereign', 'Concept photograph of a gold nameplate necklace'),
    commission: {
      engraving: 'Choose nameplate lettering and script with the concierge.',
      sizing: 'The concierge can review chain lengths and nameplate proportions.',
    },
  },
  {
    slug: 'the-aurelia', name: 'The Aurelia', seoTitle: 'The Aurelia | Natural Diamond Solitaire Pendant', materials: '14K solid gold and natural diamond concept', featured: true,
    description: 'A pendant concept centered on a single natural diamond in 14K solid gold. Ask about stone weight, grading documentation and setting options as the piece is confirmed.',
    category: 'pendant', collections: ['diamonds', 'solid-gold'],
    image: conceptImage('the-aurelia', 'Concept photograph of a round solitaire pendant on a fine gold chain'),
    required_stone: 'natural-diamond',
    commission: {
      engraving: 'Ask about a small inscription on the reverse of the setting.',
      sizing: 'Discuss the chain length and scale of the pendant.',
      stone: { name: 'Natural diamond', origin: 'Natural diamond requested', report: 'Ask about grading documentation for the selected stone.' },
    },
  },
  {
    slug: 'the-seraphina', name: 'The Seraphina', seoTitle: 'The Seraphina | Pearl & Engraved Gold Necklace', materials: 'Freshwater pearl and 14K solid gold', featured: true,
    description: 'A freshwater pearl alongside a solid 14K gold disc on a matching chain. Share an initial or meaningful date with our concierge to explore placement and engraving options.',
    category: 'necklace', collections: ['genuine-pearls', 'solid-gold'],
    image: conceptImage('the-seraphina', 'Concept photograph of a pearl and blank gold disc necklace'),
    required_stone: 'freshwater-pearl',
    commission: {
      engraving: 'An initial or short date can be proposed for the gold disc.',
      sizing: 'Discuss chain length and how the pearl and disc will sit together.',
      stone: { name: 'Freshwater pearl', origin: 'Cultured freshwater pearl requested', grade: 'Pearl size and luster are reviewed with the selected pearl.' },
    },
  },
  {
    slug: 'the-monarch', name: 'The Monarch', seoTitle: 'The Monarch | 14K Gold Monogram Signet Ring', materials: '14K solid gold', featured: true,
    description: 'A custom monogram signet ring in solid 14K gold. Discuss the initials you would like to wear and the ring size you have in mind with our concierge.',
    category: 'ring', collections: ['solid-gold'],
    image: conceptImage('the-monarch', 'Concept photograph of a polished gold signet ring on pale stone'),
    commission: {
      engraving: 'Review a monogram or initials for the signet face.',
      sizing: 'Confirm your ring size and face dimensions with the concierge.',
    },
  },
  {
    slug: 'the-celeste', name: 'The Celeste', seoTitle: 'The Celeste | Moissanite Tennis Bracelet', materials: 'Moissanite and 18K gold vermeil over sterling silver', featured: false,
    description: 'A moissanite tennis bracelet concept in 18K gold vermeil over sterling silver. The stones are moissanite and the setting is gold-coated sterling silver.',
    category: 'bracelet', collections: ['sterling-silver'],
    image: conceptImage('the-celeste', 'Concept photograph of a moissanite tennis bracelet in gold vermeil'),
    required_stone: 'moissanite',
    commission: {
      engraving: 'Ask whether the clasp can accommodate initials.',
      sizing: 'Discuss wrist measurement and the preferred fit.',
      stone: { name: 'Moissanite', origin: 'Lab-created moissanite requested', grade: 'Confirm stone size, color, and matching in the dossier.' },
    },
  },
  {
    slug: 'the-royal-coordinate', name: 'The Royal Coordinate', seoTitle: 'The Royal Coordinate | 14K Gold Coordinate Necklace', materials: '14K solid gold', featured: false,
    description: 'A solid 14K gold necklace for the coordinates of a place close to you. Ask our concierge about available engraving surfaces and how the coordinates can be arranged.',
    category: 'necklace', collections: ['solid-gold'],
    image: conceptImage('the-royal-coordinate', 'Concept photograph of a round gold coordinate medallion on a fine chain'),
    commission: {
      engraving: 'Review coordinate formatting and placement for the medallion.',
      sizing: 'Discuss how the medallion will sit and choose a chain length.',
    },
  },
  {
    slug: 'the-aurum-chain', name: 'The Aurum Chain', seoTitle: 'The Aurum Chain | 18K Solid Gold Heirloom Necklace',
    materials: '18K solid yellow gold', featured: true, tier: 'high-jewelry',
    description: 'A substantial oval-link chain commissioned in 18K solid yellow gold. Broad polished curves narrow toward the clasp, leaving room for a discreet mark of ownership.',
    category: 'necklace', collections: ['precious-gold-heirlooms', 'solid-gold'],
    image: conceptImage('the-aurum-chain', 'Design study for an oval-link yellow-gold necklace'),
    commission: {
      startingPriceCents: 385_000,
      engraving: 'Ask about initials or a date on the underside of the clasp.',
      sizing: 'Discuss 18, 20, or 22 inches and choose the link width and final gold weight.',
    },
  },
  {
    slug: 'the-empire-cuff', name: 'The Empire Cuff', seoTitle: 'The Empire Cuff | 22K Solid Gold Heirloom Cuff',
    materials: '22K solid yellow gold', featured: true, tier: 'high-jewelry',
    description: 'A wide 22K solid gold cuff with a softly brushed face and polished edges. The opening and curve are designed around the wearer’s wrist for a close, comfortable fit.',
    category: 'bracelet', collections: ['precious-gold-heirlooms', 'solid-gold'],
    image: conceptImage('the-empire-cuff', 'Design study for a wide brushed yellow-gold cuff'),
    commission: {
      startingPriceCents: 690_000,
      engraving: 'Propose a short inscription along the inner arc.',
      sizing: 'Confirm wrist circumference, cuff width, and opening before fabrication.',
    },
  },
  {
    slug: 'the-estelle-solitaire', name: 'The Estelle Solitaire', seoTitle: 'The Estelle Solitaire | Platinum 950 Natural Diamond Ring',
    materials: 'Platinum 950', featured: true, tier: 'high-jewelry',
    description: 'A round brilliant natural diamond in an open Platinum 950 setting. The commission begins with the selection of a stone with a GIA grading report and finishes with a band fitted to the wearer.',
    category: 'ring', collections: ['natural-diamond-high-jewelry', 'diamonds', 'platinum'],
    image: conceptImage('the-estelle-solitaire', 'Design study for a round brilliant diamond solitaire in a platinum ring'),
    required_stone: 'natural-diamond', required_report_lab: 'GIA',
    commission: {
      startingPriceCents: 1_285_000,
      engraving: 'Ask about initials or a short inscription inside the band.',
      sizing: 'Confirm ring size, band width, and the height of the setting.',
      stone: { name: 'Round brilliant diamond', caratWeight: '1.25–1.50 ct', origin: 'Natural diamond requested', grade: 'D–F color and VS1–VS2 clarity', report: 'A GIA grading report for the selected center stone is part of the brief.' },
    },
  },
  {
    slug: 'the-lumiere-riviere', name: 'The Lumière Rivière', seoTitle: 'The Lumière Rivière | 18K White Gold Natural Diamond Necklace',
    materials: '18K solid white gold', featured: true, tier: 'high-jewelry',
    description: 'A line of graduated natural diamonds follows the neckline in a low 18K white gold setting. The concierge develops the stone progression and proportions around the intended fit.',
    category: 'necklace', collections: ['natural-diamond-high-jewelry', 'diamonds'],
    image: conceptImage('the-lumiere-riviere', 'Design study for a graduated diamond rivière necklace'),
    required_stone: 'natural-diamond', required_report_lab: 'GIA',
    commission: {
      startingPriceCents: 1_850_000,
      engraving: 'Ask about a discreet inscription on the clasp.',
      sizing: 'Discuss 15 to 17 inches and how the diamonds should graduate across the neckline.',
      stone: { name: 'Graduated round brilliant diamonds', caratWeight: '7.00–8.50 ct total', origin: 'Natural diamonds requested', grade: 'F–H color and VS–SI1 clarity', report: 'The brief requests GIA documentation for the principal stone and a schedule for the remaining stones.' },
    },
  },
  {
    slug: 'the-imperial-ruby', name: 'The Imperial Ruby', seoTitle: 'The Imperial Ruby | 18K Gold Natural Ruby Ring Commission',
    materials: '18K solid yellow gold', featured: true, tier: 'high-jewelry',
    description: 'A cushion-cut ruby framed by small diamond shoulders in 18K yellow gold. Discuss Burmese provenance with the concierge, who will review sourcing documentation and applicable import rules before a stone is selected.',
    category: 'ring', collections: ['precious-gemstones'],
    image: conceptImage('the-imperial-ruby', 'Design study for a cushion-cut ruby ring in yellow gold'),
    required_stone: 'natural-ruby',
    commission: {
      startingPriceCents: 1_680_000,
      engraving: 'Review an inscription on the inside of the band.',
      sizing: 'Confirm ring size and the desired height of the center stone.',
      stone: { name: 'Cushion-cut ruby', caratWeight: '1.50–2.00 ct center', origin: 'Natural ruby. Myanmar origin is a sourcing preference, subject to documentation and import eligibility.', grade: 'Saturated red with good transparency', report: 'Review an independent report on origin and any treatment before selection.' },
    },
  },
  {
    slug: 'the-verde-emerald', name: 'The Verde Emerald', seoTitle: 'The Verde Emerald | 18K Gold Natural Emerald Ring Commission',
    materials: '18K solid yellow gold', featured: true, tier: 'high-jewelry',
    description: 'An emerald-cut green stone framed by tapered diamond shoulders and 18K yellow gold. The brief calls for Colombian sourcing and a review of any clarity treatment.',
    category: 'ring', collections: ['precious-gemstones'],
    image: conceptImage('the-verde-emerald', 'Design study for a rectangular emerald with white side stones in yellow gold'),
    required_stone: 'natural-emerald',
    commission: {
      startingPriceCents: 1_150_000,
      engraving: 'Ask about initials or a short date inside the band.',
      sizing: 'Confirm ring size and review side-stone proportions.',
      stone: { name: 'Emerald-cut emerald', caratWeight: '2.00–2.75 ct center', origin: 'Natural emerald. Colombian provenance requested and subject to documentation.', grade: 'Vivid green with good transparency and inclusions typical of emerald', report: 'Review an independent report on origin and any clarity enhancement.' },
    },
  },
  {
    slug: 'the-royal-sapphire', name: 'The Royal Sapphire', seoTitle: 'The Royal Sapphire | Platinum 950 Natural Blue Sapphire Pendant',
    materials: 'Platinum 950', featured: true, tier: 'high-jewelry',
    description: 'A deeply saturated oval blue sapphire encircled by a fine diamond halo in Platinum 950. Review the proportions of the halo and select a chain length to suit the pendant.',
    category: 'pendant', collections: ['precious-gemstones', 'platinum'],
    image: conceptImage('the-royal-sapphire', 'Design study for a royal blue sapphire and diamond halo pendant'),
    required_stone: 'natural-sapphire',
    commission: {
      startingPriceCents: 1_340_000,
      engraving: 'Ask about a short inscription on the back of the setting.',
      sizing: 'Discuss 16 to 20 inches and choose the scale of the pendant.',
      stone: { name: 'Oval blue sapphire', caratWeight: '2.50–3.25 ct center', origin: 'Natural sapphire requested', grade: 'Deep, vivid royal blue with good transparency', report: 'Review a lab report and treatment disclosure for the selected sapphire.' },
    },
  },
  {
    slug: 'the-solstice-south-sea', name: 'The Solstice South Sea', seoTitle: 'The Solstice South Sea | 18K Gold Pearl Drop Earrings',
    materials: '18K solid yellow gold', featured: true, tier: 'high-jewelry',
    description: 'A pair of golden baroque South Sea pearls hangs beneath sculptural 18K yellow gold cups. The concierge presents pearl pairs so the wearer can review how their shapes, luster, and tones correspond.',
    category: 'earrings', collections: ['pearl-high-jewelry', 'genuine-pearls'],
    image: conceptImage('the-solstice-south-sea', 'Design study for golden baroque South Sea pearl drop earrings'),
    required_stone: 'south-sea-pearl',
    commission: {
      startingPriceCents: 485_000,
      engraving: 'Ask whether the gold mounts can accommodate initials.',
      sizing: 'Discuss drop length, closure preference, and the intended weight.',
      stone: { name: 'Cultured South Sea pearls', origin: 'Golden cultured South Sea pearls requested', grade: '11–13 mm baroque drops with warm golden overtone and strong luster', report: 'Review the selected pair and any pearl treatment disclosures.' },
    },
  },
  {
    slug: 'the-lune-akoya', name: 'The Lune Akoya', seoTitle: 'The Lune Akoya | 18K White Gold Cultured Pearl Strand',
    materials: '18K solid white gold clasp', featured: true, tier: 'high-jewelry',
    description: 'A graduated line of white Akoya pearls knotted to an 18K white gold clasp. The strand is commissioned by length and paired for consistent luster and a soft overtone.',
    category: 'necklace', collections: ['pearl-high-jewelry', 'genuine-pearls'],
    image: conceptImage('the-lune-akoya', 'Design study for a white Akoya pearl strand with a white gold clasp'),
    required_stone: 'akoya-pearl',
    commission: {
      startingPriceCents: 145_000,
      engraving: 'Ask about a discreet inscription on the clasp.',
      sizing: 'Discuss a 16 or 18 inch strand and confirm how it should sit.',
      stone: { name: 'Cultured Akoya pearls', origin: 'Japanese cultured Akoya pearls requested, subject to sourcing documentation', grade: '6.5–7.0 mm round pearls with bright luster and a soft rose overtone', report: 'Review pearl matching and any treatment disclosures before commissioning.' },
    },
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

export function catalogImageSources({ src, srcSet, avifSrcSet }: CatalogImage): readonly string[] {
  return [src, ...[srcSet, avifSrcSet].flatMap((set) => set?.split(',').map((part) => part.trim().split(/\s+/u)[0]) ?? [])];
}

function publicStone(stone: VerifiedStone): VerifiedStone {
  const { family, description } = stone;
  if (family === 'moissanite' || family === 'other') return { family, description };
  const { colorGrade, geographicalOrigin, gradingLab, gradingReport } = stone;
  const report = {
    ...(geographicalOrigin ? { geographicalOrigin } : {}),
    ...(gradingLab ? { gradingLab } : {}),
    ...(gradingReport ? { gradingReport } : {}),
  };
  if (family === 'pearl') {
    const { diameterMm, origin, pearlType } = stone;
    return {
      family, description, pearlType, ...report,
      ...(origin ? { origin } : {}),
      ...(diameterMm ? { diameterMm } : {}),
      ...(colorGrade ? { colorGrade } : {}),
    };
  }
  const { origin, caratWeight, clarityGrade } = stone;
  const faceted = { description, origin, caratWeight, ...report, ...(clarityGrade ? { clarityGrade } : {}) };
  if (family === 'diamond') return { ...faceted, family, ...(colorGrade ? { colorGrade } : {}) };
  return { ...faceted, family, colorGrade: stone.colorGrade };
}

function matchesStone(requirement: RequiredStone | undefined, stone?: VerifiedStone): boolean {
  switch (requirement) {
    case 'natural-diamond': return stone?.family === 'diamond' && stone.origin === 'natural';
    case 'natural-ruby': return stone?.family === 'ruby' && stone.origin === 'natural';
    case 'natural-emerald': return stone?.family === 'emerald' && stone.origin === 'natural';
    case 'natural-sapphire': return stone?.family === 'sapphire' && stone.origin === 'natural';
    case 'freshwater-pearl': return stone?.family === 'pearl' && stone.pearlType === 'freshwater';
    case 'south-sea-pearl': return stone?.family === 'pearl' && stone.pearlType === 'South Sea';
    case 'akoya-pearl': return stone?.family === 'pearl' && stone.pearlType === 'Akoya';
    case 'moissanite': return stone?.family === 'moissanite';
    default: return true;
  }
}

function validStone(product: SourceProduct, stone: VerifiedStone | undefined): boolean {
  if (!matchesStone(product.required_stone, stone)) return false;
  if (product.collections.includes('diamonds') && stone?.family !== 'diamond') return false;
  if (product.collections.includes('genuine-pearls') && stone?.family !== 'pearl') return false;
  if (product.required_report_lab && (!stone || !('gradingLab' in stone)
    || stone.gradingLab !== product.required_report_lab || !stone.gradingReport?.trim())) return false;

  if (!stone) return true;
  if (!stone.description.trim()) return false;
  if ('caratWeight' in stone && (!Number.isFinite(stone.caratWeight) || stone.caratWeight <= 0)) return false;
  if (product.tier !== 'high-jewelry') return true;
  if (stone.family === 'pearl') return Boolean(stone.origin && stone.diameterMm?.trim() && stone.colorGrade?.trim());
  if (stone.family === 'diamond') return Boolean(stone.colorGrade?.trim() && stone.clarityGrade?.trim());
  return 'colorGrade' in stone && Boolean(stone.colorGrade?.trim());
}

function verifiedDetails(product: SourceProduct): VerifiedProductDetails | undefined {
  const details = product.approved_details;
  if (!details) return;
  const { image, description, materials, dimensions, metalPurity, stone, availability } = details;
  if (!image.approved || !description.trim() || !materials.trim() || !dimensions.trim()
    || (product.tier === 'high-jewelry' && !metalPurity?.trim())) {
    throw new Error(`Catalog ${product.slug}: approved details require exact-item imagery and confirmed specifications`);
  }
  const conceptSources = new Set(catalogImageSources(product.image));
  if (!validImagePath(image.src) || !validSrcSet(image.srcSet) || !validSrcSet(image.avifSrcSet) || !image.alt.trim()
    || !Number.isSafeInteger(image.width) || image.width <= 0 || !Number.isSafeInteger(image.height) || image.height <= 0
    || catalogImageSources(image).some((source) => conceptSources.has(source))) {
    throw new Error(`Catalog ${product.slug}: approved imagery must identify a distinct exact-item image served by the storefront`);
  }
  if (!validStone(product, stone)) throw new Error(`Catalog ${product.slug}: stone details are incomplete or conflict with the item description`);
  return {
    dimensions, ...(metalPurity ? { metalPurity } : {}), ...(stone ? { stone: publicStone(stone) } : {}),
    ...(availability === 'InStock' ? { availability } : {}),
  };
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
    const { commission, tier } = product;
    const startingPrice = commission?.startingPriceCents;
    if (tier === 'high-jewelry' && (startingPrice === undefined || !Number.isSafeInteger(startingPrice) || startingPrice <= 0
      || !commission?.engraving.trim() || !commission.sizing.trim())) {
      throw new Error(`Catalog ${product.slug}: high jewelry commissions need a positive price estimate and personalization specifications`);
    }
    const specs = verifiedDetails(product);
    const details = specs ? product.approved_details : undefined;
    return {
      slug: product.slug, name: product.name, seoTitle: product.seoTitle, description: details?.description ?? product.description,
      materials: details?.materials ?? product.materials, category: product.category, collections: product.collections,
      image: publicImage(details?.image ?? { ...product.image, approved: false }), featured: product.featured,
      ...(tier ? { tier } : {}), ...(commission ? { commission } : {}),
      ...(specs ? { verifiedDetails: specs } : {}),
    };
  });
  return {
    collections: currentCollections.map(({ slug, name, seoTitle, description, image, featured, tier }) =>
      ({ slug, name, seoTitle, description, image: publicImage(image), featured, ...(tier ? { tier } : {}) })),
    products: publicProducts,
  };
}
