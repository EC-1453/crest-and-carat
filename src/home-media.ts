const sizeList = [480, 720, 1440]

export const homeHero = {
  src: '/images/hero-1440.webp',
  alt: 'Concept styling of gold jewelry, pearls and an engraved pendant on sunlit limestone',
  width: 1440,
  height: 1080,
  sizes: '(min-width: 96rem) 52rem, (min-width: 48rem) 52vw, 100vw',
  webp: sizeList.map((width) => `/images/hero-${width}.webp ${width}w`).join(', '),
  avif: sizeList.map((width) => `/images/hero-${width}.avif ${width}w`).join(', '),
}
