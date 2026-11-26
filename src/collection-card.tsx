import { collectionPath } from './catalog';
import type { CatalogImage, Collection } from './catalog-types';
import './catalog.css';

const cardSizes = '(max-width: 540px) 45vw, (max-width: 900px) 48vw, 360px';

export function CatalogPhoto({ image, sizes = cardSizes, eager = false }: { image: CatalogImage; sizes?: string; eager?: boolean }) {
  return (
    <picture>
      {image.avifSrcSet && <source type="image/avif" srcSet={image.avifSrcSet} sizes={sizes} />}
      <img src={image.src} srcSet={image.srcSet} sizes={image.srcSet ? sizes : undefined}
        width={image.width} height={image.height} alt={image.alt}
        loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} decoding="async" />
    </picture>
  );
}

export function CollectionCard({ collection }: { collection: Collection }) {
  return (
    <article className="collection-card">
      <a href={collectionPath(collection.slug)}>
        <figure className="collection-card__image">
          <CatalogPhoto image={collection.image} />
          {!collection.image.approved && <figcaption>Collection concept</figcaption>}
        </figure>
        <h3 className="collection-card__name">{collection.name}</h3>
      </a>
    </article>
  );
}
