import type { BrowserContext, Page } from '@playwright/test'
import { CONSENT_ROOM_PROPERTY, CONSENT_STORAGE_KEY } from '../../src/lib/analytics/consent'

/**
 * The consent notice, as the specs meet it.
 *
 * The storage key and the custom property the notice publishes are the application's own constants, read from the
 * module that defines them, so a rename there is a rename here and not a spec that quietly answers a notice that is
 * no longer asked, or reads a property nothing writes. (A literal of the key was typed in eight specs.)
 */

export { CONSENT_ROOM_PROPERTY, CONSENT_STORAGE_KEY }

/**
 * Arrive as a visitor who has already declined, so the notice does not cover the lower part of a phone's hero and
 * every measurement is not of the notice. The notice has its own tests, which do not call this.
 */
export async function denyConsent(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    ([key]) => {
      try {
        localStorage.setItem(key, 'denied')
      } catch {
        /* private mode: the notice shows, and the tests that mind say so */
      }
    },
    [CONSENT_STORAGE_KEY]
  )
}

/** The notice itself. */
export const consentNotice = (page: Page) => page.getByRole('dialog', { name: /analytics consent/i })
