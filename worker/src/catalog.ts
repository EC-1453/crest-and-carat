export interface Address {
  fullName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface CartItem {
  sku: string;
  quantity: number;
  engraving: string;
}

type ShippingRegion = 'US' | 'GULF' | 'INTERNATIONAL';

interface CatalogRow {
  sku: string;
  product_slug: string;
  variant_id: string;
  name: string;
  variant_name: string;
  price_cents: number;
  supplier_id: string;
  supplier_sku: string;
  supplier_api_approved: 0 | 1;
  max_quantity: number;
  engraving_mode: 'none' | 'optional' | 'required';
  engraving_min_length: number;
  engraving_max_length: number;
  engraving_allow_letters: 0 | 1;
  engraving_allow_digits: 0 | 1;
  engraving_extra_characters: string;
  engraving_uppercase_only: 0 | 1;
  engraving_format: 'text' | 'decimal';
  engraving_instructions: string;
}

interface CatalogListingRow extends CatalogRow {
  destinations_json: string;
}

interface ShippingRow {
  country: string;
  region: ShippingRegion;
  label: string;
}

interface DeliveryRow extends ShippingRow {
  shipping_cents: number;
  rate_bps: number | null;
  taxable_shipping: 0 | 1 | null;
  tax_disclosure: string | null;
  terms_version: string | null;
}

export class CatalogError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'CatalogError';
    this.status = status;
  }
}

export const MAX_CART_LINES = 20;
export const MAX_SKU_QUANTITY = 20;
const skuPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/u;
const countryPattern = /^[A-Z]{2}$/u;
const nonprintingEngraving = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const usaStates = new Set(
  'AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY'.split(' '),
);
const coordinates = /([+-]?[0-9]{1,3}(?:\.[0-9]+)?), ?([+-]?[0-9]{1,3}(?:\.[0-9]+)?)/u;
const exactCoordinates = new RegExp(`^(?:${coordinates.source})$`, 'u');

const verifiedCatalog = `catalog.active = 1
  AND catalog.supplier_cost_cents > 0
  AND catalog.price_cents >= 2 * catalog.supplier_cost_cents
  AND julianday(catalog.supplier_verified_at) <= julianday('now')`;

function engravingPolicy(row: CatalogRow) {
  const enabled = row.engraving_mode !== 'none';
  let pattern: string | null = null;
  if (enabled) {
    if (row.engraving_format === 'decimal') {
      pattern = coordinates.source;
    } else {
      const extra = new Set(row.engraving_extra_characters);
      const allowed = [...extra]
        .filter((character) => !nonprintingEngraving.test(character))
        .map((character) => `\\u{${character.codePointAt(0)?.toString(16)}}`);
      if (row.engraving_allow_letters) allowed.push('\\p{Letter}', '\\p{Mark}');
      if (row.engraving_allow_digits) allowed.push('[0-9]');
      pattern = allowed.length ? `(?:${allowed.join('|')})+` : null;
    }
  }
  return {
    minLength: enabled ? row.engraving_min_length : 0,
    maxLength: enabled ? row.engraving_max_length : 0,
    required: row.engraving_mode === 'required',
    pattern,
    instructions: enabled ? row.engraving_instructions : '',
    uppercaseOnly: enabled && row.engraving_uppercase_only === 1,
  };
}

function validateEngraving(row: CatalogRow, engraving: string): void {
  const policy = engravingPolicy(row);
  if (!engraving && !policy.required) return;
  const length = Array.from(engraving).length;
  if (!policy.pattern || nonprintingEngraving.test(engraving) || !engraving.trim()
    || length < policy.minLength || length > policy.maxLength
    || (policy.uppercaseOnly && engraving !== engraving.toUpperCase())
    || !new RegExp(`^(?:${policy.pattern})$`, 'u').test(engraving)) {
    throw new CatalogError(`Review the engraving instructions for ${row.name} — ${row.variant_name}.`);
  }
  if (row.engraving_format === 'decimal') {
    const match = exactCoordinates.exec(engraving);
    if (!match || Math.abs(Number(match[1])) > 90 || Math.abs(Number(match[2])) > 180) {
      throw new CatalogError('Enter valid decimal latitude and longitude separated by a comma.');
    }
  }
}

function publicItem(row: CatalogRow) {
  return {
    sku: row.sku,
    productSlug: row.product_slug,
    variantId: row.variant_id,
    name: row.name,
    variantName: row.variant_name,
    priceCents: row.price_cents,
  };
}

export async function getCatalog(db: D1Database) {
  const [catalogResult, shippingResult, settings] = await Promise.all([
    db.prepare(`
      SELECT catalog.*, (
        SELECT json_group_array(destination.country)
        FROM catalog_item_destinations AS destination
        JOIN shipping_rates AS rate ON rate.country = destination.country AND rate.active = 1
        WHERE destination.sku = catalog.sku
          AND EXISTS (SELECT 1 FROM tax_rules AS tax WHERE tax.country = destination.country)
      ) AS destinations_json
      FROM catalog_items AS catalog
      WHERE ${verifiedCatalog}
      ORDER BY catalog.product_slug, catalog.variant_id
    `).all<CatalogListingRow>(),
    db.prepare(`
      SELECT rate.country, rate.region, rate.label FROM shipping_rates AS rate
      WHERE rate.active = 1 AND EXISTS (SELECT 1 FROM tax_rules AS tax WHERE tax.country = rate.country)
      ORDER BY rate.country
    `).all<ShippingRow>(),
    db.prepare('SELECT terms_version FROM commerce_settings WHERE id = 1').first<{ terms_version: string }>(),
  ]);
  const items = catalogResult.results.flatMap((row) => {
    const destinations = JSON.parse(row.destinations_json) as string[];
    const engraving = engravingPolicy(row);
    if (!destinations.length || (row.engraving_mode !== 'none' && !engraving.pattern)) return [];
    return [{ ...publicItem(row), engraving, maxQuantity: row.max_quantity, destinations }];
  });
  return { items, shipping: shippingResult.results, termsVersion: settings?.terms_version ?? null };
}

function normalizeDestination(address: Address) {
  const country = address.country.trim().toUpperCase();
  const state = address.state.trim().toUpperCase();
  const postalCode = address.postalCode.trim().toUpperCase();
  if (!countryPattern.test(country)) throw new CatalogError('Choose a valid delivery country.');
  if (country === 'US' && (!usaStates.has(state) || !/^[0-9]{5}(?:-[0-9]{4})?$/u.test(postalCode))) {
    throw new CatalogError('Enter a two-letter US state code and a valid ZIP code.');
  }
  const postalKey = postalCode.replace(/[^A-Z0-9]/gu, '');
  return { country, state, postalKey };
}

export async function calculateQuote(db: D1Database, items: readonly CartItem[], address: Address) {
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_CART_LINES) {
    throw new CatalogError(`Your bag must contain 1–${MAX_CART_LINES} lines.`);
  }
  for (const item of items) {
    if (!item || typeof item.sku !== 'string' || !skuPattern.test(item.sku)
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_SKU_QUANTITY
      || typeof item.engraving !== 'string' || item.engraving.length > 320) {
      throw new CatalogError('Review the item, quantity and engraving in your bag.');
    }
  }
  const { country, state, postalKey } = normalizeDestination(address);
  const skuList = [...new Set(items.map(({ sku }) => sku))];
  const [catalog, delivery] = await db.batch<CatalogRow | DeliveryRow>([
    db.prepare(`
      SELECT catalog.* FROM catalog_items AS catalog
      JOIN catalog_item_destinations AS destination ON destination.sku = catalog.sku AND destination.country = ?
      WHERE ${verifiedCatalog} AND catalog.sku IN (${skuList.map(() => '?').join(', ')})
    `).bind(country, ...skuList),
    db.prepare(`
      SELECT rate.country, rate.region, rate.label, rate.rate_cents AS shipping_cents, tax.rate_bps,
             tax.taxable_shipping, tax.disclosure AS tax_disclosure,
             (SELECT terms_version FROM commerce_settings WHERE id = 1) AS terms_version
      FROM shipping_rates AS rate
      LEFT JOIN tax_rules AS tax ON tax.country = rate.country AND tax.administrative_area IN ('', ?)
        AND substr(?, 1, length(tax.postal_prefix)) = tax.postal_prefix
      WHERE rate.country = ? AND rate.active = 1
      ORDER BY tax.administrative_area DESC, length(tax.postal_prefix) DESC
      LIMIT 1
    `).bind(state, postalKey, country),
  ]);

  const deliveryRow = delivery.results[0] as DeliveryRow | undefined;
  if (!deliveryRow) throw new CatalogError('Delivery is unavailable for this destination.', 422);
  const { rate_bps: rate, tax_disclosure: taxDisclosure, terms_version: termsVersion } = deliveryRow;
  if (rate === null || !taxDisclosure) throw new CatalogError('A delivery quote is unavailable for this address.', 422);
  if (!termsVersion) throw new CatalogError('Checkout is temporarily unavailable.', 503);

  const bySku = new Map((catalog.results as CatalogRow[]).map((row) => [row.sku, row]));
  const quantityBySku = new Map<string, number>();
  const quotedItems = items.map(({ sku, quantity, engraving }) => {
    const row = bySku.get(sku);
    if (!row) throw new CatalogError('A piece in your bag is unavailable at this destination.', 422);
    const skuQuantity = (quantityBySku.get(sku) ?? 0) + quantity;
    if (skuQuantity > row.max_quantity) {
      throw new CatalogError(`The maximum quantity for ${row.name} — ${row.variant_name} is ${row.max_quantity}.`, 422);
    }
    quantityBySku.set(sku, skuQuantity);
    validateEngraving(row, engraving);
    return {
      ...publicItem(row),
      quantity,
      engraving,
      supplierId: row.supplier_id,
      supplierSku: row.supplier_sku,
      supplierApiApproved: row.supplier_api_approved === 1,
    };
  });
  const subtotalCents = quotedItems.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const { shipping_cents: shippingCents } = deliveryRow;
  const taxableCents = subtotalCents + (deliveryRow.taxable_shipping ? shippingCents : 0);
  const taxCents = Math.round(taxableCents * rate / 10_000);
  return {
    currency: 'USD' as const,
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents: subtotalCents + shippingCents + taxCents,
    shippingLabel: deliveryRow.label,
    shippingRegion: deliveryRow.region,
    taxDisclosure,
    termsVersion,
    items: quotedItems,
  };
}
