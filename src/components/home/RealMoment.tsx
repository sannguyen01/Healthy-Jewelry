'use client'

import Image from 'next/image'
import { useReveal } from '@/lib/hooks/useReveal'

/**
 * "The Moment" (beat 6): a statement and a photograph. The photograph is `philosophy-waterproof.jpg`,
 * which the materials section used to show at 200px; the section is a registry now and has no
 * photograph, so the picture has the room here. It replaces `hero-banner.jpg`, which this section
 * repeated from the hero, a few screens above, on the same page.
 */
export function RealMoment() {
  const [sectionRef, visible] = useReveal(0.1)

  return (
    <section
      ref={sectionRef as React.RefObject<HTMLElement>}
      className="hj-band"
      data-space="lg"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity var(--duration-slow) var(--ease), transform var(--duration-slow) var(--ease)',
        overflow: 'hidden',
      }}
    >
      <div className="hj-grid hj-moment-grid">
        <div className="hj-moment-copy">
          <span className="label-eyebrow">The Moment</span>
          <h2 className="hj-moment-line">
            Born on the streets.
            <br />
            Crafted for the skin.
          </h2>
          <p className="hj-lede">A digital continuation of a street-first relationship.</p>
        </div>
        <div className="hj-moment-side">
          <div className="card-tile hj-moment-media">
            <Image
              src="/images/lifestyle/philosophy-waterproof.jpg"
              alt=""
              fill
              sizes="(max-width: 900px) 100vw, 560px"
              style={{ objectFit: 'cover', objectPosition: 'center 40%' }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

export default RealMoment
