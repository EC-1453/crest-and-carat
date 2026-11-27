import { describe, expect, it } from 'vitest';
import { compileCatalog, sourceProducts } from '../src/catalog-source';

const solitaire = sourceProducts.find(({ slug }) => slug === 'the-estelle-solitaire');
if (!solitaire) throw new Error('The high jewelry solitaire is missing from the catalog.');

const approvedImage = {
  src: '/images/fixture-approved-solitaire.webp',
  srcSet: '/images/fixture-approved-solitaire-360.webp 360w, /images/fixture-approved-solitaire.webp 720w',
  width: 720,
  height: 540,
  alt: 'Simulated approved platinum solitaire',
  approved: true,
};

const approvedDetails = {
  dimensions: 'Fixture dimensions',
  description: 'Simulated solitaire with exact specifications.',
  materials: 'Platinum 950',
  metalPurity: 'Platinum 950',
  availability: 'InStock',
  image: approvedImage,
  stone: {
    family: 'diamond',
    origin: 'natural',
    caratWeight: 1.4,
    colorGrade: 'E',
    clarityGrade: 'VS1',
    description: 'Fixture round brilliant diamond',
    gradingLab: 'GIA',
    gradingReport: 'Simulated report reference',
  },
} as const;

describe('high jewelry catalog approval', () => {
  it('publishes exact metal and gemstone data only after approval', () => {
    const ordinary = compileCatalog([solitaire]).products[0];
    expect(ordinary.verifiedDetails).toBeUndefined();
    expect(ordinary.image.approved).toBe(false);
    expect(ordinary.commission?.startingPriceCents).toBe(1_285_000);

    const verified = compileCatalog([{ ...solitaire, approved_details: approvedDetails }]).products[0];
    expect(verified.image).toEqual(approvedImage);
    expect(verified.verifiedDetails).toEqual({
      availability: 'InStock',
      dimensions: 'Fixture dimensions',
      metalPurity: 'Platinum 950',
      stone: approvedDetails.stone,
    });
  });

  it('rejects responsive image sources inherited from the design study', () => {
    const image = { ...approvedImage, avifSrcSet: solitaire.image.avifSrcSet };
    expect(() => compileCatalog([{ ...solitaire, approved_details: { ...approvedDetails, image } }]))
      .toThrow(/approved imagery must identify a distinct exact-item image/);
  });

  it('rejects missing confirmed metal purity, a lab-grown substitute or a missing GIA report', () => {
    expect(() => compileCatalog([{ ...solitaire, approved_details: { ...approvedDetails, metalPurity: undefined } }]))
      .toThrow(/confirmed specifications/);
    expect(() => compileCatalog([{
      ...solitaire,
      approved_details: { ...approvedDetails, stone: { ...approvedDetails.stone, origin: 'lab-grown' } },
    }])).toThrow(/stone details are incomplete or conflict/);
    expect(() => compileCatalog([{
      ...solitaire,
      approved_details: { ...approvedDetails, stone: { ...approvedDetails.stone, gradingReport: undefined } },
    }])).toThrow(/stone details are incomplete or conflict/);
  });
});
