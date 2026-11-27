import type { ReactNode } from 'react';
import { TrackOrder } from './commerce/track-order';
import { BUSINESS_ADDRESS, FINAL_SALE_NOTICE, SUPPORT_EMAIL } from './business';
import { shippingFaq } from './editorial-meta';
import './editorial.css';

type EditorialSection = Readonly<{ id: string; heading: string; content: ReactNode }>;
type EditorialLink = Readonly<{ href: string; label: string; description: string }>;
type EditorialEntry = Readonly<{
  path: string;
  heading: string;
  eyebrow: string;
  intro: string;
  sections: readonly EditorialSection[];
  links?: readonly EditorialLink[];
}>;

const guideLinks = [
  {
    href: '/guides/engraved-fine-jewelry/',
    label: 'Engraved Fine Jewelry Guide',
    description: 'What to consider when choosing a nameplate, a monogram or a private inscription.',
  },
  {
    href: '/guides/choosing-genuine-pearls/',
    label: 'Choosing Genuine Pearls Guide',
    description: 'A closer look at freshwater, Akoya and South Sea pearls and how to care for them.',
  },
  {
    href: '/guides/bespoke-gifting-us-gulf/',
    label: 'Bespoke Gifting & Heirloom Styling',
    description: 'Plan a personal gift, then allow time for crafting, insured delivery and customs.',
  },
] as const;

const deliveryLink = {
  href: '/shipping-delivery/',
  label: 'Shipping & Delivery',
  description: 'Production windows, insured transit, customs and signatures.',
};
const finalSaleLink = {
  href: '/custom-orders-final-sale/#craftsmanship-and-transit-promise',
  label: 'Craftsmanship & Transit Promise',
  description: 'How we help with a defect, engraving error, wrong item or transit damage.',
};
const contactLink = {
  href: '/contact/',
  label: 'Contact the concierge',
  description: 'Ask about a piece, a personal inscription or delivery to your destination.',
};

const guideArtwork: Readonly<Partial<Record<string, { src: string; alt: string }>>> = {
  '/guides/engraved-fine-jewelry/': {
    src: '/images/the-sovereign',
    alt: 'A script nameplate on a gold necklace',
  },
  '/guides/choosing-genuine-pearls/': {
    src: '/images/genuine-pearls',
    alt: 'Luminous pearls in a close-up jewelry arrangement',
  },
  '/guides/bespoke-gifting-us-gulf/': {
    src: '/images/jeweled-objects-evening-bags',
    alt: 'A jeweled evening accessory in warm editorial light',
  },
};

const guideImageSizes = '(min-width: 76rem) 23rem, (min-width: 64rem) 29vw, (min-width: 40rem) 45vw, 90vw';

function CraftConcept() {
  const sizes = '(min-width: 76rem) 34rem, (min-width: 52rem) 43vw, 90vw';

  return (
    <figure className="editorial-hero-image">
      <picture>
        <source
          type="image/avif"
          srcSet="/images/craft-480.avif 480w, /images/craft-720.avif 720w"
          sizes={sizes}
        />
        <img
          src="/images/craft-720.webp"
          srcSet="/images/craft-480.webp 480w, /images/craft-720.webp 720w"
          sizes={sizes}
          width="720"
          height="540"
          fetchPriority="high"
          alt="Hands polishing a gold pendant with a soft cloth on limestone"
        />
      </picture>
      <figcaption>Concept imagery</figcaption>
    </figure>
  );
}

function SupportLink() {
  return <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
}

const entries: readonly EditorialEntry[] = [
  {
    path: '/about/',
    eyebrow: 'The house',
    heading: 'About CREST & CARAT',
    intro: 'A jewelry house for the names, places and moments you want to hold close.',
    sections: [
      {
        id: 'jewelry-with-a-story',
        heading: 'Jewelry with a story',
        content: <>
          <p>CREST & CARAT is an independent jewelry house. Our collection brings together personal fine jewelry and jeweled objects, from name necklaces and monogram signets to pearls and pieces selected for evening wear. We start with the occasion and the person wearing the piece.</p>
          <p>A name belongs to the wearer, a pair of coordinates belongs to a memory, and a pearl can carry the story of an occasion long after the evening is over. The collection is organized by material so you can begin with the metal, gemstone or object that suits the gift.</p>
        </>,
      },
      {
        id: 'private-client-service',
        heading: 'Private client service',
        content: <>
          <p>Share the piece, any inscription you have in mind and the delivery country with our concierge. We can confirm what the supplier can make, which options are available and the timing before you decide whether to order.</p>
          <p>For clients planning a gift in the United States, the United Kingdom or the Gulf, we can discuss production, insured delivery and any special handling before the occasion.</p>
        </>,
      },
    ],
    links: [
      { href: '/our-craft/', label: 'Our Craft', description: 'How materials, engraving surfaces and finishing shape a piece.' },
      { href: '/shop/', label: 'Explore the collection', description: 'Browse by material, occasion or the keepsake you have in mind.' },
      contactLink,
    ],
  },
  {
    path: '/our-craft/',
    eyebrow: 'The house',
    heading: 'Our Craft',
    intro: 'The beauty of a personal piece begins with the details you approve.',
    sections: [
      {
        id: 'material-and-finish',
        heading: 'Material and finish',
        content: <>
          <p>Solid gold, sterling silver and platinum each have a different color, weight and way of wearing. For each orderable piece we confirm the metal and finish, along with any applicable plating, before you commit. Gold vermeil has a sterling silver base with a layer of gold. Its care differs from solid gold.</p>
          <p>Pearls are described by their confirmed type. An orderable diamond piece identifies the verified natural or laboratory-grown origin and the specifications available for that item. Moissanite has its own optical character and is identified by name.</p>
        </>,
      },
      {
        id: 'making-room-for-your-words',
        heading: 'Making room for your words',
        content: <>
          <p>An engraved disc, a cut nameplate and a signet face each give lettering a different shape. Available characters, font, line length and punctuation depend on the exact piece and the working surface. If your wording has an accent, a symbol or a script requirement, ask the concierge to confirm it in advance.</p>
          <p>Read the final wording at the size of the piece where possible. Check capitalization, spacing, the fit of the chain or ring, and the placement of the text before giving approval.</p>
        </>,
      },
      {
        id: 'care-over-time',
        heading: 'Care over time',
        content: <>
          <p>Keep individual pieces in separate soft pouches, and ask about cleaning instructions for any mixed-material piece. Pearls are especially sensitive to perfume and cosmetics. Keep settings and clasps checked regularly if you plan to wear a piece often.</p>
        </>,
      },
    ],
    links: [guideLinks[0], guideLinks[1], finalSaleLink],
  },
  {
    path: '/track-order/',
    eyebrow: 'Client care',
    heading: 'Track an Order',
    intro: 'Use your private order link to check payment and shipping updates.',
    sections: [
      {
        id: 'find-your-tracking-link',
        heading: 'Find your tracking link',
        content: <p>Once your order dispatches, use the carrier tracking details in your shipping email. If the piece is still being made, or you need help with the last scan, share your order reference with the concierge for a status update.</p>,
      },
      {
        id: 'request-an-update',
        heading: 'Check your order status',
        content: <><TrackOrder /><p>If you need a new private link, email <SupportLink /> from the address on your order.</p></>,
      },
    ],
    links: [deliveryLink, contactLink],
  },
  {
    path: '/terms/',
    eyebrow: 'Client care',
    heading: 'Terms & Conditions',
    intro: 'The terms for inquiries, confirmed orders and delivery from CREST & CARAT.',
    sections: [
      {
        id: 'operator-and-inquiries',
        heading: 'The house and your inquiries',
        content: <>
          <p>These terms apply to inquiries and orders with CREST & CARAT through <a href="/">carat.evercrest.vip</a>. For questions about these terms or a proposed order, email <SupportLink />.</p>
          {BUSINESS_ADDRESS && <address>{BUSINESS_ADDRESS}</address>}
          <p>An inquiry starts a conversation about a piece. For an orderable item, the confirmed product details, selected options, total charges and estimated schedule are shown or supplied before payment. Images identified as concepts illustrate a style, with approved item images used for pieces accepting orders.</p>
        </>,
      },
      {
        id: 'ordering-and-payment',
        heading: 'Ordering and payment',
        content: <>
          <p>Review the final item, quantity, engraving, size, delivery address and charges before paying. The store uses US dollars. Any exchange-rate conversion or foreign transaction fee applied by your card issuer is separate.</p>
          <p>Your order confirmation records the agreed details. If you see a mistake, contact the concierge immediately. Once production has begun, changes depend on whether the confirmed piece can still be amended.</p>
        </>,
      },
      {
        id: 'bespoke-returns-and-rights',
        heading: 'Bespoke returns and your rights',
        content: <>
          <p>{FINAL_SALE_NOTICE}</p>
          <p>See <a href="/custom-orders-final-sale/">Custom Orders & Final Sale</a> for the process if your piece has a manufacturing defect, an engraving error on our part, an incorrect item or insured transit damage. Applicable mandatory consumer rights continue to apply.</p>
          <p>For any non-personalized item, review the applicable return terms confirmed before purchase and contact the concierge for help.</p>
        </>,
      },
      {
        id: 'delivery-and-delays',
        heading: 'Delivery and delays',
        content: <p>Production and carrier transit are estimated separately. <a href="/shipping-delivery/">Shipping & Delivery</a> explains signatures, customs charges, and how to choose between agreeing to a revised ship date and cancelling for a refund if we cannot ship on time.</p>,
      },
    ],
    links: [deliveryLink, finalSaleLink, { href: '/privacy/', label: 'Privacy', description: 'How information is handled when you contact or order from the house.' }],
  },
  {
    path: '/custom-orders-final-sale/',
    eyebrow: 'Client care',
    heading: 'Custom Orders & Final Sale',
    intro: 'Your custom CREST & CARAT piece is made to the details you approve. We help you check those details before the order is placed.',
    sections: [
      {
        id: 'before-you-order',
        heading: 'Before you order',
        content: <>
          <p>Confirm the spelling, letter case, punctuation, size and selected options on your order summary. Ask the concierge about any special character, engraving position or fit before you approve the piece.</p>
          <p className="editorial-note">{FINAL_SALE_NOTICE}</p>
        </>,
      },
      {
        id: 'craftsmanship-and-transit-promise',
        heading: 'Craftsmanship & Transit Promise',
        content: <>
          <p>Change-of-mind returns and exchanges are unavailable for personalized pieces after they are made to order. Every piece is covered for manufacturing defects, engraving errors on our part, wrong items or insured transit damage.</p>
          <ol>
            <li>Email <SupportLink /> with the order reference and a short description of the issue. For an engraving concern, include the wording shown on your confirmation.</li>
            <li>Attach clear photos of the piece and the relevant details. For transit damage, also keep the original packaging and share photos of the shipping box, label and packing materials.</li>
            <li>We review the order and explain the remedy and next steps. These may include repair, replacement or refund, as appropriate. Contact us before returning a piece so we can help with safe, insured routing where needed.</li>
          </ol>
          <p>Please contact us promptly if you see damage or receive the wrong piece. Your statutory rights apply as provided by law.</p>
        </>,
      },
    ],
    links: [deliveryLink, contactLink],
  },
  {
    path: '/shipping-delivery/',
    eyebrow: 'Client care',
    heading: 'Shipping & Delivery',
    intro: 'CREST & CARAT offers insured delivery in the United States and International / Gulf Express where confirmed for your piece and destination.',
    sections: [
      {
        id: 'production-and-transit',
        heading: 'Production and transit',
        content: <>
          <dl className="editorial-definitions">
            <div><dt>Production time</dt><dd>The period from approval of the piece and payment through preparation for dispatch. It depends on the item and the selected customization.</dd></div>
            <div><dt>Carrier transit time</dt><dd>The estimated period from dispatch to delivery. Carrier schedules, customs clearance, local holidays and signature availability can affect delivery.</dd></div>
          </dl>
          <p>Your orderable piece or written quote gives the production lead time and estimated carrier transit separately. Include your delivery country, postal code and required date when asking about a time-sensitive gift.</p>
        </>,
      },
      {
        id: 'insured-delivery-and-signatures',
        heading: 'Insured delivery and signatures',
        content: <>
          <p>US insured delivery and International / Gulf Express insured delivery are subject to item and address eligibility. Gulf destinations include the United Arab Emirates, Saudi Arabia, Qatar, Kuwait, Bahrain and Oman. UK and other international availability is confirmed for the piece and address before payment.</p>
          <p>Plan for a recipient or authorized person to sign at the delivery address. Signature or identity requirements depend on the carrier and destination and are confirmed with the selected service. Watch your tracking and follow the carrier’s instructions if a delivery attempt is missed.</p>
        </>,
      },
      {
        id: 'customs-and-duties',
        heading: 'Customs and duties',
        content: <>
          <p>International import duties, VAT, customs processing fees or other local charges may apply. Your order terms identify any applicable import charges collected by us. Where local charges remain payable on import, the recipient may receive a payment request from the carrier or customs authority before delivery.</p>
          <p>Use the recipient’s legal name, complete delivery address and current phone number if the carrier requires it. If the item is a surprise, decide in advance who can answer delivery or customs questions.</p>
        </>,
      },
      {
        id: 'if-we-cannot-ship-on-time',
        heading: 'If we cannot ship on time',
        content: <>
          <p>For US orders, if we cannot ship within the time stated at purchase, or within 30 days when no time was stated, we will contact you before that deadline. We will give an updated shipping date when we can reasonably estimate one and explain how to agree to the delay or cancel for a full refund.</p>
          <p>We seek your affirmative agreement to a delay. If you decline or we do not receive your agreement by the response deadline in the notice, we cancel the order and issue a prompt refund of the payment received. If a further delay occurs, we ask for your agreement again. A carrier delay after dispatch is handled by the concierge with the carrier.</p>
        </>,
      },
      {
        id: 'delivery-help',
        heading: 'Delivery help',
        content: <p>If the parcel arrives damaged or you cannot locate it after a delivery scan, email <SupportLink /> with the order reference and tracking number. Keep any packaging and see the <a href="/custom-orders-final-sale/#craftsmanship-and-transit-promise">Craftsmanship & Transit Promise</a> for help with damage.</p>,
      },
      {
        id: 'shipping-questions',
        heading: 'Shipping questions',
        content: <div className="editorial-faq">
          {shippingFaq.map(({ question, answer }) => (
            <div key={question}>
              <h3>{question}</h3>
              <p>{answer}</p>
            </div>
          ))}
        </div>,
      },
    ],
    links: [
      { href: '/track-order/', label: 'Track Order', description: 'Ask about production or use the carrier link in your dispatch email.' },
      guideLinks[2],
      contactLink,
    ],
  },
  {
    path: '/privacy/',
    eyebrow: 'Client care',
    heading: 'Privacy',
    intro: 'How CREST & CARAT handles your information when you browse, inquire, order or join the Private List.',
    sections: [
      {
        id: 'who-is-responsible',
        heading: 'Who is responsible',
        content: <>
          <p>CREST & CARAT is responsible for the information described in this policy. For questions about your information or marketing choices on <a href="/">carat.evercrest.vip</a>, email <SupportLink />.</p>
          {BUSINESS_ADDRESS && <address>{BUSINESS_ADDRESS}</address>}
        </>,
      },
      {
        id: 'information-we-receive',
        heading: 'Information we receive',
        content: <>
          <p>If you join the Private List, we record your email address, signup source and time of consent. If you submit an inquiry, we use your email and any name, selected piece and message you provide. If you proceed to a hosted checkout, we may receive your email and selected piece before checkout, then receive the order and delivery details needed for fulfillment.</p>
          <p>The payment provider handles the payment information entered in its hosted checkout. To respond to an inquiry or fulfill an order, we may use the destination, selected options and engraving text you approve. The hosting platform may also process request information for operation and security.</p>
        </>,
      },
      {
        id: 'how-information-is-used',
        heading: 'How information is used',
        content: <>
          <p>We use information to respond to requests, prepare and fulfill orders, communicate about production or delivery, prevent abuse and meet legal obligations. Where applicable, the basis for processing depends on its purpose, including responding to a request before entering a contract, fulfilling an order, complying with a legal duty, maintaining the site's security or acting on your consent to marketing.</p>
          <p>Service messages about an inquiry or order are separate from marketing. We send Private List marketing when you choose to receive it. You can request removal by emailing <SupportLink />.</p>
        </>,
      },
      {
        id: 'services-and-delivery-partners',
        heading: 'Services and delivery partners',
        content: <>
          <p>The site uses Cloudflare to host its pages and, when configured, store submitted information. Configured email and workflow services can relay submissions to the concierge. If a form is unavailable, you may choose to send the request through your email app. A confirmed order may require sharing relevant details with a supplier, payment provider, insurer, shipping carrier or customs authority.</p>
          <p>Our services and partners may process information in the United States and other countries where they operate. We keep records for as long as reasonably needed for the purposes above, including applicable accounting, legal and dispute obligations.</p>
        </>,
      },
      {
        id: 'installed-app-and-site-storage',
        heading: 'Installed app and site storage',
        content: <p>The installed web app can store public site assets on your device for faster loading and a limited offline experience. Checkout, order status and form submissions require a connection. Browser and device settings allow you to clear local site storage and remove the installed web app.</p>,
      },
      {
        id: 'your-choices',
        heading: 'Your choices',
        content: <p>Email <SupportLink /> to withdraw marketing consent or request access, correction or deletion of your information. Depending on local law, you may also have rights to object, restrict use, request a copy or contact your data protection authority. We may need to verify who is making the request before sharing or changing personal information.</p>,
      },
    ],
    links: [contactLink, { href: '/terms/', label: 'Terms & Conditions', description: 'How inquiries, orders and payment work with the house.' }],
  },
  {
    path: '/guides/',
    eyebrow: 'The journal',
    heading: 'The Fine Jewelry Guides',
    intro: 'Practical advice on choosing a piece, writing the inscription and getting the gift there on time.',
    sections: [],
    links: guideLinks,
  },
  {
    path: '/guides/engraved-fine-jewelry/',
    eyebrow: 'The journal',
    heading: 'Engraved Fine Jewelry Guide',
    intro: 'A name on a necklace has a different intimacy from a date tucked against the skin. Start with how you want the inscription to be seen.',
    sections: [
      {
        id: 'choose-the-surface',
        heading: 'Choose the surface first',
        content: <>
          <p>An engraved disc, a nameplate and a signet all hold words differently. A disc gives short lettering a quiet place to sit. A cut or formed nameplate makes the outline of each letter part of the necklace itself. A signet brings initials into a compact, visible surface. Ask which process is available on the exact piece. <a href="/products/the-sovereign/">The Sovereign</a> is a name necklace concept, while <a href="/products/the-monarch/">The Monarch</a> is a place to start if you want to discuss a signet.</p>
          <p>A coordinate necklace often needs room for digits, direction letters and punctuation. A landmark entered in a mapping app can display decimal degrees or degrees, minutes and seconds. Copy one format consistently and verify the location on a map before approving the text. Ask whether <a href="/products/the-royal-coordinate/">The Royal Coordinate</a> has a confirmed surface for the format you have chosen.</p>
        </>,
      },
      {
        id: 'settle-the-wording',
        heading: 'Settle the exact wording',
        content: <>
          <p>Write the inscription out in the case you intend to use and count any spaces or punctuation. Ask whether a supplier counts a dash or a symbol in its limit. A monogram may use a different letter order depending on the design and the relative size of the center character. Give the initials in the order you want to see and review the exact arrangement before purchase.</p>
          <p>For a name with an accent or a non-Latin script, give the text to the concierge exactly as written by the wearer. If a script is read right to left, also verify the appearance of the whole line and the position of any numbers. Font and character support depend on the tool and supplier. Choose the exact available treatment once those details are confirmed.</p>
        </>,
      },
      {
        id: 'fit-and-metal',
        heading: 'Consider the fit and metal',
        content: <>
          <p>Measure a chain the wearer already enjoys before relying on a standard length. A wider nameplate can sit differently from a small pendant. For ring sizing, compare against a well-fitting ring on the intended finger, or ask a jeweler for a measurement. A broader band can feel snugger, especially in warm weather.</p>
          <p>Look at the finishing as well as the metal. Polished gold reflects light around the letters, while a satin finish can make a small inscription easier to read at some angles. Explore <a href="/collections/solid-gold/">Solid Gold</a> for a warm everyday metal, <a href="/collections/sterling-silver/">Sterling Silver</a> for a bright cool tone or <a href="/collections/platinum/">Platinum</a> for a naturally white precious metal.</p>
        </>,
      },
      {
        id: 'approve-and-keep-a-copy',
        heading: 'Approve the design and keep a copy',
        content: <>
          <p>Review the confirmation beside the original spelling and size reference. Verify the metal, finish, font, surface, placement and either chain length or ring size. Save the approved wording and order number so the concierge can answer questions during production.</p>
          <p>If the piece is a gift, share your deadline before approval and leave time for insured transit and any signature requirements. <a href="/shipping-delivery/">Shipping & Delivery</a> explains how the production window and carrier estimate fit together.</p>
        </>,
      },
    ],
    links: [
      { href: '/collections/solid-gold/', label: 'Explore Solid Gold', description: 'Consider a warm precious metal for an everyday inscription.' },
      { href: '/products/the-sovereign/', label: 'The Sovereign', description: 'Discuss a 14K solid gold name necklace with the concierge.' },
      guideLinks[2],
    ],
  },
  {
    path: '/guides/choosing-genuine-pearls/',
    eyebrow: 'The journal',
    heading: 'Choosing Genuine Pearls Guide',
    intro: 'Look first at how a pearl catches the light. Shape, size and color matter for style, while luster determines much of what you see when it moves.',
    sections: [
      {
        id: 'what-genuine-means',
        heading: 'What genuine means',
        content: <>
          <p>A cultured pearl grows inside a mollusk with human assistance. A natural pearl forms without that intervention and is much rarer. Both are genuine pearls. A simulated pearl is made to look like a pearl. For an orderable piece, check the confirmed pearl type and any known color treatment alongside the setting and size.</p>
          <p>Color has several parts. Body color is the main hue, and an overtone is the color you can see over it in some light. A soft rose overtone, for example, can look different beside yellow gold than it does against a cool-toned metal. Ask for approved photographs or details of the actual piece before making a color-sensitive decision.</p>
        </>,
      },
      {
        id: 'compare-cultured-pearl-types',
        heading: 'Compare cultured pearl types',
        content: <>
          <p><strong>Freshwater pearls</strong> offer a wide range of shapes and tones, from softly oval beads to free-form baroque silhouettes. A single expressive pearl can sit comfortably beside an engraved disc. <a href="/products/the-seraphina/">The Seraphina</a> is a starting point for discussing a freshwater pearl paired with solid gold and an engraving.</p>
          <p><strong>Akoya pearls</strong> often appeal to buyers seeking a round profile and a crisp, bright reflection. Compare the luster, size and matching of the specific set. For earrings or a strand, look at how evenly the pearls share tone and light across the whole piece.</p>
          <p><strong>South Sea pearls</strong> are often larger and are associated with a broad, soft glow. White and golden varieties can create different effects against silk, evening fabrics or a gold setting. Ask about the actual dimensions and how the setting sits when worn.</p>
        </>,
      },
      {
        id: 'judge-the-pearl-in-light',
        heading: 'Judge the pearl in light',
        content: <>
          <p>Compare luster by looking at the clarity and brightness of reflections on the surface. Look next at shape, surface marks and how the piece is matched. A small surface mark may be placed toward the setting on a pendant. With a strand, read the spacing and size in addition to the finish on each pearl.</p>
          <p>Grade letters can vary between sellers, so ask what each grade covers. A written description of type, size range, shape, luster and surface is easier to compare. If you are choosing a gift, confirm the piece’s dimensions and where it will sit on the wearer.</p>
        </>,
      },
      {
        id: 'wear-and-store-pearls',
        heading: 'Wear and store pearls',
        content: <>
          <p>Put on pearls after perfume, cosmetics and hairspray have dried. After wearing, wipe them with a soft cloth and store them apart from metal and gemstones that could scratch the surface. Skip ultrasonic cleaners and harsh chemicals. Ask the concierge about a mixed-material piece before wet cleaning it, especially when the strand or an attachment can hold moisture.</p>
          <p>A frequently worn knotted strand deserves a regular check at its clasp and between pearls. Ask a jeweler to look at stretches, fraying or loose knots before wearing it again.</p>
        </>,
      },
    ],
    links: [
      { href: '/collections/genuine-pearls/', label: 'Explore Genuine Pearls', description: 'Browse pieces and discuss verified pearl types with the concierge.' },
      { href: '/products/the-seraphina/', label: 'The Seraphina', description: 'Discuss a freshwater pearl and a personal solid gold disc.' },
      guideLinks[2],
    ],
  },
  {
    path: '/guides/bespoke-gifting-us-gulf/',
    eyebrow: 'The journal',
    heading: 'Bespoke Gifting & Heirloom Styling: US & Gulf Concierge Guide',
    intro: 'A personal gift takes two decisions. Choose what the recipient will enjoy wearing, then make a delivery plan that fits the occasion.',
    sections: [
      {
        id: 'start-with-the-person',
        heading: 'Start with the person',
        content: <>
          <p>Look at the pieces the recipient already reaches for. A daily pendant wearer often knows their favorite chain length. Someone who wears a plain gold band may like a small monogram kept inside a piece. Pearl earrings or a jeweled clutch may make sense for a recipient who dresses around a particular occasion.</p>
          <p>Ask which tone looks familiar on the wearer. Warm gold can pick up an existing piece, while a cool-toned metal can sit comfortably with diamonds or silver in their collection. For a gift intended to become an heirloom, keep the wording simple enough to explain to the next person who wears it. A date, family initial, nickname or meaningful location is often enough.</p>
        </>,
      },
      {
        id: 'plan-for-the-occasion',
        heading: 'Plan for the occasion',
        content: <>
          <p>Before purchasing personalized jewelry, share the occasion date, country and postal code with the concierge. Count backward from the event and include time to approve the engraving, make the piece and hand it to the carrier. The carrier estimate begins after dispatch. For international orders, add time for local holidays and customs processing.</p>
          <p>Ask for the estimated production window and carrier transit separately. If the date is close, ask for a confirmed ready-to-ship item or present a handwritten note about the piece while it is being made. Where a gift will be received while the recipient is traveling, confirm the address and the dates someone can sign.</p>
        </>,
      },
      {
        id: 'us-uk-and-gulf-delivery',
        heading: 'US, UK and Gulf delivery',
        content: <>
          <p>Insured shipping availability is confirmed for the piece and address. For domestic US delivery, share any special building or access details in advance. For a UK or Gulf destination, make sure the recipient’s legal name, phone number and full street or building details match what the carrier requires. International / Gulf Express options cover eligible addresses in the UAE, Saudi Arabia, Qatar, Kuwait, Bahrain and Oman.</p>
          <p>For Dubai, Abu Dhabi, Riyadh, Doha or another destination, ask about which import charges are included and who can handle any carrier customs messages. Duties, VAT and local fees may apply. Address confirmation and a signature plan matter especially for a surprise. See <a href="/shipping-delivery/">Shipping & Delivery</a> for the information to check before ordering.</p>
        </>,
      },
      {
        id: 'give-the-piece-its-story',
        heading: 'Give the piece its story',
        content: <>
          <p>A small handwritten card can explain why you chose the inscription, what the coordinates mark or how the piece fits a family tradition. Keep the order record and care instructions with the gift. For a special event, a pearl piece can sit by the face while a jeweled evening bag carries the light lower in the outfit. Consider the garment’s neckline, fabric and closure when choosing accessories.</p>
          <p>If you are arranging several gifts for attendants or family members, keep a separate list of each recipient’s spelling, size and delivery address. Review each item against the written summary before ordering. Begin with <a href="/collections/jeweled-objects-evening-bags/">Jeweled Objects & Evening Bags</a>, <a href="/collections/genuine-pearls/">Genuine Pearls</a> or <a href="/collections/diamonds/">Diamonds</a> if you want to narrow the choice before speaking to the concierge.</p>
        </>,
      },
    ],
    links: [deliveryLink, { href: '/collections/jeweled-objects-evening-bags/', label: 'Explore Jeweled Objects & Evening Bags', description: 'Consider an evening accessory for the occasion.' }, contactLink],
  },
];

export { editorialPages } from './editorial-meta';

export function EditorialPage({ path }: { readonly path: string }) {
  const entry = entries.find((page) => page.path === path);
  if (!entry) return null;

  const isGuideIndex = entry.path === '/guides/';
  const hasCraftImage = entry.path === '/our-craft/';
  const hasTableOfContents = entry.sections.length > 2;
  const relatedTitle = isGuideIndex ? 'Explore the guides' : 'Continue exploring';

  return (
    <article className="editorial-page">
      <header className={hasCraftImage ? 'editorial-header editorial-header-with-image' : 'editorial-header'}>
        <div>
          <p className="editorial-eyebrow">{entry.eyebrow}</p>
          <h1>{entry.heading}</h1>
          <p className="editorial-intro">{entry.intro}</p>
        </div>
        {hasCraftImage && <CraftConcept />}
      </header>
      {!!entry.sections.length && (
        <div className={hasTableOfContents ? 'editorial-layout editorial-layout-with-toc' : 'editorial-layout'}>
          {hasTableOfContents && (
            <nav className="editorial-toc" aria-label="On this page">
              <p>On this page</p>
              <ul>
                {entry.sections.map((section) => (
                  <li key={section.id}><a href={`#${section.id}`}>{section.heading}</a></li>
                ))}
              </ul>
            </nav>
          )}
          <div className="editorial-content">
            {entry.sections.map((section) => (
              <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
                <h2 id={`${section.id}-heading`}>{section.heading}</h2>
                {section.content}
              </section>
            ))}
          </div>
        </div>
      )}
      {entry.links && (
        <section className="editorial-related" aria-labelledby="editorial-related-heading">
          <h2 id="editorial-related-heading">{relatedTitle}</h2>
          <ul>
            {entry.links.map((link) => {
              const artwork = isGuideIndex ? guideArtwork[link.href] : undefined;

              return (
                <li key={link.href}>
                  <a href={link.href}>
                    {artwork && (
                      <figure>
                        <picture>
                          <source
                            type="image/avif"
                            srcSet={`${artwork.src}-360.avif 360w, ${artwork.src}.avif 720w`}
                            sizes={guideImageSizes}
                          />
                          <img
                            src={`${artwork.src}.webp`}
                            srcSet={`${artwork.src}-360.webp 360w, ${artwork.src}.webp 720w`}
                            sizes={guideImageSizes}
                            alt={artwork.alt}
                            width="720"
                            height="540"
                            loading="lazy"
                            decoding="async"
                          />
                        </picture>
                        <figcaption>Concept imagery</figcaption>
                      </figure>
                    )}
                    <div className="editorial-card-copy">
                      <h3>{link.label}</h3>
                      <p>{link.description}</p>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </article>
  );
}
