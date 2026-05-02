import type { Metadata } from 'next'

// Metadata for the cart page.
// Exported from a separate file because cart/page.tsx uses 'use client'
// and Next.js does not allow metadata exports in client components.
export const metadata: Metadata = {
  title: 'Your Bag — Healthy Jewelry',
  description: 'Review your selection of implant-grade titanium, niobium, and 316L surgical steel jewelry.',
}
