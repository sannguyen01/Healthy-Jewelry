import collectionsData from '@/content/collections.json'
import type { HJCollection } from '@/types'

export function getAllCollections(): HJCollection[] {
  return collectionsData as HJCollection[]
}

export function getFeaturedCollections(): HJCollection[] {
  return (collectionsData as HJCollection[]).filter((c) => c.featured)
}

export function getCollectionBySlug(slug: string): HJCollection | undefined {
  return (collectionsData as HJCollection[]).find((c) => c.handle === slug)
}
