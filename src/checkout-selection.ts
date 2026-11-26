import type { AvailableOption, EngravingSurface, PurchasableOffer } from './catalog-types';

export interface CheckoutSelection {
  sizeId: string;
  variantId: string;
  surfaceId: string;
  engraving: string;
  fontId: string;
  destination: string;
}

export type SelectionErrors = Partial<Record<keyof CheckoutSelection, string>>;

function optionAllowed(value: string, options: readonly AvailableOption[]): boolean {
  return options.length ? options.some(({ id }) => id === value) : value === '';
}

export function engravingLength(value: string): number {
  return Array.from(value).length;
}

function engravingError(value: string, surface: EngravingSurface): string | undefined {
  const characters = Array.from(value);
  if (characters.length < surface.minCharacters || characters.length > surface.maxCharacters) {
    return `Use ${surface.minCharacters}–${surface.maxCharacters} characters for ${surface.label.toLowerCase()}.`;
  }
  const extraCharacters = new Set(surface.extraCharacters);
  const validCharacters = characters.every((character) =>
    (surface.allowLetters && /^[\p{Letter}\p{Mark}]$/u.test(character))
    || (surface.allowDigits && /^[0-9]$/u.test(character)) || extraCharacters.has(character),
  );
  if (!validCharacters) return 'Use the characters shown in the engraving instructions.';
  if (surface.uppercaseOnly && value !== value.toUpperCase()) return 'Enter your engraving in capital letters.';
  if (surface.coordinateFormat === 'decimal') {
    const coordinates = /^([+-]?[0-9]{1,3}(?:\.[0-9]+)?),\s?([+-]?[0-9]{1,3}(?:\.[0-9]+)?)$/u.exec(value);
    if (!coordinates || Math.abs(Number(coordinates[1])) > 90 || Math.abs(Number(coordinates[2])) > 180) {
      return 'Enter decimal latitude and longitude separated by a comma.';
    }
  }
  return undefined;
}

export function validateSelection(offer: PurchasableOffer, selection: CheckoutSelection): SelectionErrors {
  const errors: SelectionErrors = {};
  if (!optionAllowed(selection.sizeId, offer.sizes)) errors.sizeId = 'Choose a supported size.';
  if (!optionAllowed(selection.variantId, offer.variants)) errors.variantId = 'Choose a supported option.';
  if (!offer.eligibleDestinations.includes(selection.destination)) errors.destination = 'Choose an eligible delivery destination.';
  if (!optionAllowed(selection.surfaceId, offer.surfaces)) errors.surfaceId = 'Choose a supported engraving surface.';
  const surface = offer.surfaces.find(({ id }) => id === selection.surfaceId);
  if (surface) {
    const error = engravingError(selection.engraving, surface);
    if (error) errors.engraving = error;
    if (!optionAllowed(selection.fontId, surface.fonts)) errors.fontId = 'Choose a supported lettering style.';
  } else {
    if (selection.engraving) errors.engraving = 'Choose an engraving surface first.';
    if (selection.fontId) errors.fontId = 'Choose an engraving surface first.';
  }
  return errors;
}
