import type { ReactNode } from 'react';
import { collectionPath, collections, productPath, products } from './catalog';
import { CatalogPhoto, CollectionCard } from './collection-card';
import type { Product, VerifiedStone } from './catalog-types';
import { ProductPurchase } from './commerce/product-purchase';
import './commerce/commerce.css';

export { CatalogPhoto, CollectionCard } from './collection-card';

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <a href={productPath(product.slug)}>
        <figure className="product-card__image">
          <CatalogPhoto image={product.image} />
          {!product.image.approved && <figcaption>Design concept</figcaption>}
        </figure>
        <h3 className="product-card__name">{product.name}</h3>
        <p className="product-card__materials">{product.materials}</p>
        <p className="product-card__price">{product.image.approved ? 'View piece' : 'Inquire about this piece'}</p>
      </a>
    </article>
  );
}

export function ShopPage() {
  return (
    <div className="catalog-page container">
      <header className="page-intro catalog-intro">
        <p className="eyebrow">The Collections</p>
        <h1>Shop Fine Jewelry &amp; Jeweled Objects</h1>
        <p>Discover personalized fine jewelry and evening accessories in solid gold, sterling silver, platinum, genuine pearls and diamonds.</p>
      </header>
      <section className="catalog-section" aria-labelledby="shop-collections">
        <h2 id="shop-collections">Browse by Collection</h2>
        <div className="catalog-grid">{collections.map((collection) => <CollectionCard key={collection.slug} collection={collection} />)}</div>
      </section>
      <section className="catalog-section" aria-labelledby="shop-designs">
        <h2 id="shop-designs">Explore the Pieces</h2>
        <div className="catalog-grid">{products.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
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
          <p className="eyebrow">The Collections</p>
          <h1>{collection.name}</h1>
          <p>{collection.description}</p>
          {!pieces.length && <a className="button" href={inquiryLink}>Speak With the Concierge</a>}
        </div>
        <figure className="catalog-feature-photo">
          <CatalogPhoto image={collection.image} sizes="(max-width: 720px) 94vw, 46vw" eager />
          {!collection.image.approved && <figcaption>Collection concept</figcaption>}
        </figure>
      </header>
      {pieces.length > 0 && (
        <section className="catalog-section" aria-labelledby="collection-pieces">
          <h2 id="collection-pieces">Explore the Pieces</h2>
          <div className="catalog-grid">{pieces.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
        </section>
      )}
      <a className="catalog-text-link" href="/shop/">Browse all collections</a>
    </div>
  );
}

function productCategory(category: Product['category']): string {
  return category === 'evening-bag' ? 'Evening bag' : `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

function stoneSummary(stone: VerifiedStone): string {
  if (stone.family === 'diamond') return `${stone.origin === 'natural' ? 'Natural diamond' : 'Lab-grown diamond'}, ${stone.caratWeight} ct. ${stone.description}`;
  if (stone.family === 'pearl') return `${stone.pearlType === 'other' ? 'Genuine' : `${stone.pearlType.charAt(0).toUpperCase()}${stone.pearlType.slice(1)}`} pearl. ${stone.description}`;
  if (stone.family === 'moissanite') return `Moissanite. ${stone.description}`;
  return stone.description;
}

function Detail({ term, children }: { term: string; children?: ReactNode }) {
  if (!children) return null;
  return <div><dt>{term}</dt><dd>{children}</dd></div>;
}

export function ProductPage({ slug }: { slug: string }) {
  const product = products.find((item) => item.slug === slug);
  if (!product) return <h1>Piece unavailable</h1>;
  const details = product.verifiedDetails;
  const collectionLinks = collections.filter((collection) => product.collections.includes(collection.slug));
  return (
    <article className="catalog-page catalog-product container">
      <figure className="catalog-feature-photo catalog-product__photo">
        <CatalogPhoto image={product.image} sizes="(max-width: 720px) 94vw, 50vw" eager />
        {!product.image.approved && <figcaption>Design concept. Exact specifications and availability are confirmed by the concierge.</figcaption>}
      </figure>
      <div className="catalog-product__content">
        <header className="page-intro catalog-intro">
          <p className="eyebrow">{productCategory(product.category)}</p>
          <h1>{product.name}</h1>
          <p>{product.description}</p>
        </header>
        <dl className="catalog-specifications">
          <Detail term="Materials">{product.materials}</Detail>
          <Detail term="Dimensions">{details?.dimensions}</Detail>
          <Detail term="Stone details">{details?.stone ? stoneSummary(details.stone) : undefined}</Detail>
          <Detail term="Grading report">{details?.stone?.family === 'diamond' ? details.stone.gradingReport : undefined}</Detail>
        </dl>
        <ProductPurchase product={product} />
        <ul className="catalog-product__links" aria-label="Related collections">
          {collectionLinks.map((collection) => <li key={collection.slug}><a href={collectionPath(collection.slug)}>{collection.name}</a></li>)}
        </ul>
      </div>
    </article>
  );
}
