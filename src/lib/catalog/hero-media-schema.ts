/**
 * The art direction of the home page's first screen, as a record (ADR 054).
 *
 * ## Why this is data
 *
 * One `object-position: right center` served every width. At 390px it kept a quarter of the
 * photograph and none of the subject, and the fix then was to stop showing the photograph at all
 * on a phone. A crop is a decision a person makes about a particular image, so it lives beside the
 * image: a source, a focal point, the box the subject occupies and the corner the copy sits in, once for
 * a wide screen and once for a narrow one. The subject box is what the browser tests hold the crop to:
 * at every width it must stay visible and stay clear of the copy.
 *
 * ## Why provenance is part of it
 *
 * The photograph this site shipped carries a signed manifest naming a trained algorithmic source, and
 * shows jewellery that is not ours. Nothing in the repository said so. A record that cannot say where its
 * image came from lets the next replacement make the same silence. So the rules are in the schema:
 *
 * - a **photographed** image names the catalogue pieces it shows, and every handle exists;
 * - an **ai-generated** image names none, because it cannot depict a real piece, and carries no
 *   consent state of its own;
 * - an **approved** state needs a named person and a date, exactly as a claim's does. No agent writes one.
 *
 * Validation happens at module load, from the catalogue reader, so a malformed record fails the build the
 * way a malformed product does. See `src/lib/catalog/index.ts`.
 */

import { z } from 'zod'

const unit = z.number().min(0).max(1)
const isoDate = z.iso.date()
const reviewer = z.string().trim().min(3)

const productHandle = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'a product handle is a lowercase kebab-case slug')

/**
 * The least a subject box may span, on each axis, as a fraction of the source. The browser tests hold a crop to
 * "the subject stays in frame and stays clear of the copy"; a box a hundredth of the image wide is in frame at every
 * width and clear of everything, so it makes both pass for any crop. Five percent is a face seen from far away, not a
 * measurement of anything the crop must protect.
 */
export const MIN_SUBJECT_SPAN = 0.05

/** A region of the source image, normalised: 0 is its top-left, 1 its bottom-right. */
export const rectSchema = z
  .object({ x0: unit, y0: unit, x1: unit, y1: unit })
  .strict()
  .refine((r) => r.x0 < r.x1 && r.y0 < r.y1, {
    message: 'a subject box must have a positive width and height, with x0 < x1 and y0 < y1',
  })
  .refine((r) => r.x1 - r.x0 >= MIN_SUBJECT_SPAN && r.y1 - r.y0 >= MIN_SUBJECT_SPAN, {
    message: `a subject box must span at least ${MIN_SUBJECT_SPAN} of the image on each axis, or it protects nothing`,
  })

/**
 * One crop. `src` is a local file under `/images/`: the content security policy allows images from
 * this origin only, and `..` is refused so a record cannot name a file outside the folder. JPEG and PNG
 * only, which are the formats `imageSize` can verify against the record's own `width` and `height`.
 */
const cropFields = {
  src: z
    .string()
    .regex(/^\/images\/[A-Za-z0-9_\-./]+\.(?:jpe?g|png)$/, 'src must be a local /images/ file ending .jpg, .jpeg or .png')
    .refine((src) => !src.split('/').includes('..'), { message: 'src must not contain ".." segments' }),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  focal: z.object({ x: unit, y: unit }).strict(),
  subject: rectSchema,
  copyZone: z.enum(['bottom-start', 'bottom-end']),
}

/** The wide crop: the copy lies on a veil (`overlay`) or in a bounded, opaque card (`card`, ADR 013). */
export const cropSchema = z.object({ ...cropFields, variant: z.enum(['overlay', 'card']) }).strict()

/**
 * The narrow crop is always an overlay. A card is bounded to a fraction of the photograph (ADR 013), and at a phone's
 * width that fraction is a column too narrow to hold a sentence, so a narrow card could be written and not rendered
 * well. The schema is where that is decided, and the stylesheet has no branch for it.
 */
export const mobileCropSchema = z
  .object({
    ...cropFields,
    variant: z.literal('overlay', {
      error: 'mobile.variant must be "overlay": a card bounded to a fraction of the photograph is unusable at phone widths',
    }),
  })
  .strict()

const approval = z
  .object({ state: z.literal('approved'), reviewer, decidedOn: isoDate })
  .strict()

const rightsSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('unreviewed') }).strict(),
  approval,
])

const subjectConsentSchema = z.union([
  z.literal('not-applicable'),
  z.discriminatedUnion('state', [z.object({ state: z.literal('unreviewed') }).strict(), approval]),
])

export const provenanceSchema = z
  .object({
    origin: z.enum(['photographed', 'ai-generated', 'illustrated']),
    source: z.string().trim().min(10),
    rights: rightsSchema,
    subjectConsent: subjectConsentSchema,
    pieces: z.array(productHandle),
  })
  .strict()

export const heroMediaSchema = z
  .object({
    id: z.literal('home'),
    alt: z.string().trim().min(1).max(200),
    headerTone: z.enum(['light', 'dark']),
    desktop: cropSchema,
    mobile: mobileCropSchema,
    provenance: provenanceSchema,
  })
  .strict()
  .superRefine((media, ctx) => {
    const { origin, pieces, subjectConsent } = media.provenance
    if (origin === 'photographed' && pieces.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['provenance', 'pieces'],
        message: 'a photographed image names the pieces it shows; with none, it is not evidence of any piece',
      })
    }
    if (origin === 'ai-generated' && pieces.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['provenance', 'pieces'],
        message: 'an ai-generated image cannot depict a real piece, so it names none',
      })
    }
    if (origin !== 'photographed' && subjectConsent !== 'not-applicable') {
      ctx.addIssue({
        code: 'custom',
        path: ['provenance', 'subjectConsent'],
        message: `a ${origin} image has no photographed subject, so its subjectConsent is "not-applicable"`,
      })
    }
  })

export type Rect = z.infer<typeof rectSchema>
export type HeroCrop = z.infer<typeof cropSchema>
export type HeroMobileCrop = z.infer<typeof mobileCropSchema>
export type HeroMedia = z.infer<typeof heroMediaSchema>

/**
 * Validate the raw record, and check the one thing a schema cannot: that every piece it names is in the
 * catalogue. Throws, deliberately, so an invalid record stops the build rather than rendering a first
 * screen whose provenance nobody can vouch for.
 */
export function loadHeroMedia(raw: unknown, known: { productHandles: readonly string[] }): HeroMedia {
  const parsed = heroMediaSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(
      `The hero media record in src/content/hero/ is invalid.\n\n` +
        `${JSON.stringify(parsed.error.issues, null, 2)}\n\n` +
        `See src/lib/catalog/hero-media-schema.ts for what each field means. This throw is ` +
        `deliberate: a first screen whose crop or provenance is malformed stops the build.`
    )
  }

  const unknownHandles = parsed.data.provenance.pieces.filter((h) => !known.productHandles.includes(h))
  if (unknownHandles.length > 0) {
    throw new Error(
      `The hero media record in src/content/hero/ is invalid.\n\n` +
        `provenance.pieces names ${unknownHandles.map((h) => `"${h}"`).join(', ')}, which ` +
        `${unknownHandles.length === 1 ? 'is' : 'are'} not in the catalogue.`
    )
  }

  return parsed.data
}
