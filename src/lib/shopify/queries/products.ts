// Healthy Jewelry — Shopify product GraphQL queries
//
// PRODUCT_FRAGMENT's variant count is parameterized via $variantsFirst so the
// same fragment serves both the full product-detail fetch (needs every size
// variant) and lightweight listing fetches (only need the first variant to
// resolve a default id) without duplicating the field list.

export const PRODUCT_FRAGMENT = /* GraphQL */ `
  fragment ProductFragment on Product {
    id
    handle
    title
    description
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
    variants(first: $variantsFirst) {
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
    collections(first: 5) {
      edges {
        node {
          handle
          title
        }
      }
    }
    # Physical spec ("2 mm · 1.8 g"). Optional: Shopify has no native field for
    # it, so it lives in a metafield and resolves to null when unset — the
    # detail page hides the line rather than rendering an empty one.
    spec: metafield(namespace: "custom", key: "spec") {
      value
    }
  }
`

export const GET_PRODUCT_BY_HANDLE = /* GraphQL */ `
  ${PRODUCT_FRAGMENT}
  query GetProductByHandle($handle: String!, $variantsFirst: Int = 20) {
    product(handle: $handle) {
      ...ProductFragment
    }
  }
`

export const GET_PRODUCTS = /* GraphQL */ `
  ${PRODUCT_FRAGMENT}
  query GetProducts($first: Int!, $after: String, $variantsFirst: Int = 1) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          ...ProductFragment
        }
      }
    }
  }
`

export const GET_PRODUCTS_BY_COLLECTION = /* GraphQL */ `
  ${PRODUCT_FRAGMENT}
  query GetProductsByCollection(
    $handle: String!
    $first: Int!
    $after: String
    $variantsFirst: Int = 1
  ) {
    collection(handle: $handle) {
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
      products(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            ...ProductFragment
          }
        }
      }
    }
  }
`

export const SEARCH_PRODUCTS = /* GraphQL */ `
  ${PRODUCT_FRAGMENT}
  query SearchProducts($query: String!, $first: Int!, $after: String, $variantsFirst: Int = 1) {
    search(query: $query, first: $first, after: $after, types: PRODUCT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          ... on Product {
            ...ProductFragment
          }
        }
      }
    }
  }
`

// Bestsellers / new arrivals — tag-filtered server-side rather than fetching
// the whole catalog and filtering client-side.
export const GET_BESTSELLERS = /* GraphQL */ `
  ${PRODUCT_FRAGMENT}
  query GetBestsellers($first: Int!, $variantsFirst: Int = 1) {
    products(first: $first, query: "tag:bestseller") {
      edges {
        node {
          ...ProductFragment
        }
      }
    }
  }
`

export const GET_NEW_ARRIVALS = /* GraphQL */ `
  ${PRODUCT_FRAGMENT}
  query GetNewArrivals($first: Int!, $variantsFirst: Int = 1) {
    products(first: $first, query: "tag:new") {
      edges {
        node {
          ...ProductFragment
        }
      }
    }
  }
`
