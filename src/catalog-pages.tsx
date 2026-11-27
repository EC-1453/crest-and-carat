import type { ReactNode } from 'react';
import { collectionPath, collections, productPath, products } from './catalog';
import { CatalogPhoto, CollectionCard } from './collection-card';
import type { PrerenderedOffer, Product, VerifiedStone } from './catalog-types';
import { formatUsd, purchasableItems } from './commerce/api';
import { CommissionEstimate, dossierPath, ProductPurchase } from './commerce/product-purchase';
import { useCatalog } from './commerce/use-catalog';
import './commerce/commerce.css';

export { CatalogPhoto, CollectionCard } from './collection-card';

const highJewelryCollections = collections.filter(({ tier }) => tier === 'high-jewelry');
const highJewelryPieces = products.filter(({ tier }) => tier === 'high-jewelry');
const personalJewelryPieces = products.filter(({ tier }) => tier !== 'high-jewelry');

interface StoneSpecifications {
  readonly name: string;
  readonly caratWeight?: string;
  readonly origin?: string;
  readonly grade?: string;
  readonly report?: string;
  readonly description?: string;
}

function upperFirst(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function stoneOrigin(origin?: string, location?: string): string | undefined {
  return [origin, location].filter(Boolean).join(' · ') || undefined;
}

function stoneGrade(color?: string, clarity?: string): string | undefined {
  return [color && `Color ${color}`, clarity && `Clarity ${clarity}`].filter(Boolean).join(' · ') || undefined;
}

function verifiedStoneSpecs(stone: VerifiedStone): StoneSpecifications {
  if (stone.family === 'diamond' || stone.family === 'ruby' || stone.family === 'emerald' || stone.family === 'sapphire') {
    return {
      name: upperFirst(stone.family),
      description: stone.description,
      caratWeight: `${stone.caratWeight} ct`,
      origin: stoneOrigin(upperFirst(stone.origin), stone.geographicalOrigin),
      grade: stoneGrade(stone.colorGrade, stone.clarityGrade),
      report: stoneOrigin(stone.gradingLab, stone.gradingReport),
    };
  }
  if (stone.family === 'pearl') {
    return {
      name: stone.pearlType === 'other' ? 'Pearl' : `${upperFirst(stone.pearlType)} pearl`,
      description: stone.description,
      origin: stoneOrigin(stone.origin && upperFirst(stone.origin), stone.geographicalOrigin),
      grade: [stone.diameterMm && `${stone.diameterMm} mm`, stone.colorGrade && `Color ${stone.colorGrade}`].filter(Boolean).join(' · ') || undefined,
      report: stoneOrigin(stone.gradingLab, stone.gradingReport),
    };
  }
  return { name: stone.family === 'moissanite' ? 'Moissanite' : 'Gemstone', description: stone.description };
}

function Detail({ term, children }: { term: string; children?: ReactNode }) {
  if (!children) return null;
  return <div><dt>{term}</dt><dd>{children}</dd></div>;
}

function ProductSpecifications({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { verifiedDetails, commission } = product;
  const stone = verifiedDetails?.stone ? verifiedStoneSpecs(verifiedDetails.stone) : verifiedDetails ? undefined : commission?.stone;
  const metal = verifiedDetails?.metalPurity && verifiedDetails.metalPurity !== product.materials
    ? `${verifiedDetails.metalPurity} · ${product.materials}`
    : product.materials;
  const metalTerm = verifiedDetails ? 'Verified metal' : 'Proposed metal';
  const stoneTerm = verifiedDetails ? 'Verified gemstone' : 'Proposed gemstone';

  return (
    <dl className={compact ? 'product-card__specifications' : 'catalog-specifications'}>
      <Detail term={metalTerm}>{metal}</Detail>
      {compact ? (
        <Detail term={stoneTerm}>{stone && [stone.name, stone.caratWeight, stone.origin, stone.grade, stone.report].filter(Boolean).join(' · ')}</Detail>
      ) : (
        <>
          <Detail term={stoneTerm}>{stone && [stone.name, 'description' in stone && stone.description].filter(Boolean).join(' · ')}</Detail>
          <Detail term="Carat weight">{stone?.caratWeight}</Detail>
          <Detail term="Origin">{stone?.origin}</Detail>
          <Detail term="Grade and characteristics">{stone?.grade}</Detail>
          <Detail term={verifiedDetails ? 'Grading report' : 'Report requested'}>{stone?.report}</Detail>
          <Detail term="Dimensions">{verifiedDetails?.dimensions}</Detail>
        </>
      )}
      <Detail term="Engraving">{commission?.engraving}</Detail>
      <Detail term="Sizing">{commission?.sizing}</Detail>
    </dl>
  );
}

export function ProductCard({ product, priceCents }: { product: Product; priceCents?: number }) {
  const href = productPath(product.slug);
  return (
    <article className="product-card">
      <a className="product-card__piece" href={href}>
        <figure className="product-card__image">
          <CatalogPhoto image={product.image} />
          {!product.image.approved && <figcaption>Design concept</figcaption>}
        </figure>
        <h3 className="product-card__name">{product.name}</h3>
      </a>
      <div className="product-card__body">
        {priceCents === undefined ? <CommissionEstimate priceCents={product.commission?.startingPriceCents} /> : (
          <p className="product-card__price">From {formatUsd(priceCents)} USD</p>
        )}
        <ProductSpecifications product={product} compact />
        <p className="product-card__delivery">Insured US and Gulf courier options are confirmed by destination. Ask about armored service.</p>
        <div className="product-card__actions">
          {priceCents !== undefined && <a className="button" href={`${href}#acquire-piece`}>Acquire Piece</a>}
          <a className="catalog-card-link" href={dossierPath(product.slug)} aria-label={`Request Private Concierge Dossier for ${product.name}`}>
            Request Private Concierge Dossier
          </a>
        </div>
      </div>
    </article>
  );
}

function ProductGrid({ pieces }: { pieces: readonly Product[] }) {
  const { state } = useCatalog(pieces.some(({ image, verifiedDetails }) => image.approved && Boolean(verifiedDetails)));
  return (
    <div className="catalog-grid">
      {pieces.map((product) => {
        const offers = state.status === 'ready' && product.image.approved && product.verifiedDetails
          ? purchasableItems(state.catalog, product.slug)
          : [];
        const lowestPrice = offers.length ? Math.min(...offers.map(({ priceCents }) => priceCents)) : undefined;
        return <ProductCard key={product.slug} product={product} priceCents={lowestPrice} />;
      })}
    </div>
  );
}

export function ShopPage() {
  return (
    <div className="catalog-page container">
      <header className="page-intro catalog-intro catalog-intro--opening">
        <h1>The Collections</h1>
        <p>Explore high jewelry in precious gold, diamonds, colored gemstones and cultured pearls, alongside the house’s personalized pieces and jeweled objects.</p>
        <a className="button" href="/high-jewelry/">Explore High Jewelry</a>
      </header>
      <section className="catalog-section" aria-labelledby="shop-collections">
        <h2 id="shop-collections">Browse by Collection</h2>
        <div className="catalog-grid">
          {[...highJewelryCollections, ...collections.filter(({ tier }) => tier !== 'high-jewelry')].map((collection) => (
            <CollectionCard key={collection.slug} collection={collection} />
          ))}
        </div>
      </section>
      <section className="catalog-section" aria-labelledby="shop-designs">
        <h2 id="shop-designs">Explore the Pieces</h2>
        <ProductGrid pieces={[...highJewelryPieces, ...personalJewelryPieces]} />
      </section>
    </div>
  );
}

export function HighJewelryPage() {
  const lead = highJewelryCollections[0];
  return (
    <div className="catalog-page container">
      <header className="catalog-lead catalog-lead--high">
        <div className="page-intro catalog-intro">
          <p className="eyebrow">Haute Joaillerie</p>
          <h1>High Jewelry</h1>
          <p>Heirloom chains and cuffs in 18K and 22K solid gold, natural diamond and colored gemstone settings, and South Sea and Akoya pearl commissions.</p>
          <div className="button-row">
            <a className="button" href="#pieces">Explore the Pieces</a>
            <a className="button button--secondary" href="/contact/">Speak With the Concierge</a>
          </div>
        </div>
        {lead && (
          <figure className="catalog-feature-photo">
            <CatalogPhoto image={lead.image} sizes="(max-width: 720px) 92vw, 46vw" eager />
            {!lead.image.approved && <figcaption>Design concepts</figcaption>}
          </figure>
        )}
      </header>
      <section className="catalog-section" aria-labelledby="high-jewelry-collections">
        <h2 id="high-jewelry-collections">The High Jewelry Collections</h2>
        <div className="catalog-grid">{highJewelryCollections.map((collection) => <CollectionCard key={collection.slug} collection={collection} />)}</div>
      </section>
      <section className="catalog-section" id="pieces" aria-labelledby="high-jewelry-selection">
        <h2 id="high-jewelry-selection">High Jewelry Pieces</h2>
        <ProductGrid pieces={highJewelryPieces} />
      </section>
    </div>
  );
}

export function CollectionPage({ slug }: { slug: string }) {
  const collection = collections.find((item) => item.slug === slug);
  if (!collection) return <h1>Collection unavailable</h1>;
  const pieces = products.filter((product) => product.collections.includes(slug));
  const inquiryLink = `/contact/?collection=${encodeURIComponent(slug)}`;
  return (
    <div className="catalog-page container">
      <header className="catalog-lead">
        <div className="page-intro catalog-intro">
          <p className="eyebrow">{collection.tier === 'high-jewelry' ? 'High Jewelry' : 'The Collections'}</p>
          <h1>{collection.name}</h1>
          <p>{collection.description}</p>
          {!pieces.length && <a className="button" href={inquiryLink}>Speak With the Concierge</a>}
        </div>
        <figure className="catalog-feature-photo">
          <CatalogPhoto image={collection.image} sizes="(max-width: 720px) 92vw, 46vw" eager />
          {!collection.image.approved && <figcaption>Collection concept</figcaption>}
        </figure>
      </header>
      {pieces.length > 0 && (
        <section className="catalog-section" aria-labelledby="collection-pieces">
          <h2 id="collection-pieces">Explore the Pieces</h2>
          <ProductGrid pieces={pieces} />
        </section>
      )}
      <a className="catalog-text-link" href={collection.tier === 'high-jewelry' ? '/high-jewelry/' : '/shop/'}>
        {collection.tier === 'high-jewelry' ? 'Explore all High Jewelry' : 'Browse all collections'}
      </a>
    </div>
  );
}

function categoryLabel(category: Product['category']): string {
  return upperFirst(category.replaceAll('-', ' '));
}

export function ProductPage({ slug, prerenderedOffer }: { slug: string; prerenderedOffer?: PrerenderedOffer }) {
  const product = products.find((item) => item.slug === slug);
  if (!product) return <h1>Piece unavailable</h1>;
  const collectionLinks = collections.filter((collection) => product.collections.includes(collection.slug));
  return (
    <article className="catalog-page catalog-product container">
      <figure className="catalog-feature-photo catalog-product__photo">
        <CatalogPhoto image={product.image} sizes="(max-width: 720px) 92vw, 50vw" eager />
        {!product.image.approved && <figcaption>Design concept. The concierge confirms the exact piece and its availability.</figcaption>}
      </figure>
      <div className="catalog-product__content">
        <header className="page-intro catalog-intro">
          <p className="eyebrow">{product.tier === 'high-jewelry' ? `High Jewelry · ${categoryLabel(product.category)}` : categoryLabel(product.category)}</p>
          <h1>{product.name}</h1>
          <p>{product.description}</p>
        </header>
        <section className="catalog-product__purchase" id="acquire-piece" aria-label="Purchase and private inquiries">
          <ProductPurchase product={product} prerenderedOffer={prerenderedOffer} />
        </section>
        <section className="catalog-product__detail" aria-labelledby="piece-details">
          <h2 id="piece-details">{product.verifiedDetails ? 'Piece Specifications' : 'Proposed Specifications'}</h2>
          <ProductSpecifications product={product} />
        </section>
        <section className="catalog-product__detail" aria-labelledby="piece-delivery">
          <h2 id="piece-delivery">Insured Delivery</h2>
          <p>For eligible US and Gulf addresses, we confirm the insured courier, signature requirements and any armored courier option before you approve the order. Your quote specifies transit, coverage and applicable import charges.</p>
          <a className="catalog-text-link" href="/shipping-delivery/">Delivery and destination details</a>
        </section>
        <ul className="catalog-product__links" aria-label="Related collections">
          {collectionLinks.map((collection) => <li key={collection.slug}><a href={collectionPath(collection.slug)}>{collection.name}</a></li>)}
        </ul>
      </div>
    </article>
  );
}
