import Image, { getImageProps } from 'next/image'
import type { HeroMedia } from '@/lib/catalog'

/**
 * The hero photograph, one element when the two crops share a file and a `<picture>` when they do not
 * (ADR 054).
 *
 * **Same file, two crops** is today's case and most of the time: the crop is the *focal point*, which the
 * stylesheet switches at the breakpoint with `object-position`, so a plain `<Image>` is right, and it can be
 * preloaded, because there is only one thing it might load.
 *
 * **Two files** is what real photography brings: a landscape for a wide screen and a portrait for a phone.
 * Then the browser must choose which file to fetch, and only a `<source media>` can say so; a preload cannot
 * (it would fetch both, which defeats art direction), so the `<img>` asks to load at once and at high priority instead. The
 * breakpoint is the 900px of every other hero rule and is one of the sizes `design-layers` allows. The
 * `<picture>` is a block that fills the media wrapper exactly, because a `display: contents` or inline parent
 * would make `layout-invariants.spec.ts` compare the image's box with the wrong container.
 *
 * Server-side: `getImageProps` is a pure function of the record, and nothing here needs the browser.
 */
export function HeroPicture({ media }: { media: HeroMedia }) {
  const { alt, desktop, mobile } = media

  if (desktop.src === mobile.src) {
    return <Image className="hj-hero-photo" src={desktop.src} alt={alt} fill preload sizes="100vw" />
  }

  // `loading: 'eager'` is asked for, not assumed: without `priority` or `preload` the framework answers every image
  // with `loading="lazy"`, and a lazy <img> is held back until layout has put its box in view, which is a delay on the
  // largest thing on the first screen. `fetchPriority` alone does not undo it.
  const common = { alt, fill: true as const, sizes: '100vw', loading: 'eager' as const, fetchPriority: 'high' as const }
  const wide = getImageProps({ ...common, src: desktop.src }).props
  const narrow = getImageProps({ ...common, src: mobile.src }).props

  return (
    <picture className="hj-hero-picture">
      <source media="(max-width: 900px)" srcSet={narrow.srcSet} />
      <img {...wide} alt={alt} className="hj-hero-photo" />
    </picture>
  )
}
