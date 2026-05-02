// Healthy Jewelry — Shopify collection GraphQL queries

export const COLLECTION_FRAGMENT = /* GraphQL */ `
  fragment CollectionFragment on Collection {
    id
    handle
    title
    description
    image {
      url
      altText
      width
      height
    }
  }
`

export const GET_COLLECTIONS = /* GraphQL */ `
  ${COLLECTION_FRAGMENT}
  query GetCollections($first: Int!) {
    collections(first: $first) {
      edges {
        node {
          ...CollectionFragment
        }
      }
    }
  }
`

export const GET_COLLECTION_BY_HANDLE = /* GraphQL */ `
  ${COLLECTION_FRAGMENT}
  query GetCollectionByHandle($handle: String!, $first: Int!, $after: String) {
    collection(handle: $handle) {
      ...CollectionFragment
      products(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            handle
            title
            description
            descriptionHtml
            tags
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            compareAtPriceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            images(first: 5) {
              edges {
                node {
                  url
                  altText
                  width
                  height
                }
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  availableForSale
                  price {
                    amount
                    currencyCode
                  }
                  compareAtPrice {
                    amount
                    currencyCode
                  }
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
            collections(first: 3) {
              edges {
                node {
                  handle
                  title
                }
              }
            }
          }
        }
      }
    }
  }
`
