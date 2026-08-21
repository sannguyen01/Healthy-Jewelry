// CLAUDE.md documents nine routes as using PageHeader for their title block
// (Our Story, Contact, Materials, Stores, FAQ, Shipping, Terms, Privacy,
// Legal) — everything that isn't a commerce or utility page. That claim was
// prose-only: nothing stopped one of these routes from drifting back to a
// hand-rolled <h1>, the exact failure PageHeader was built to end (see its
// own doc comment — nine pages once drifted to three different heading
// weights before this existed).
//
// Scoped deliberately to this route list, not every <h1> in the app: cart,
// checkout, shop, product-detail, and the error pages all have their own
// <h1> by design and are not part of this convention.
const PAGEHEADER_ROUTES = [
  'src/app/about/page.tsx',
  'src/app/contact/page.tsx',
  'src/app/materials/page.tsx',
  'src/app/stores/page.tsx',
  'src/app/faq/page.tsx',
  'src/app/shipping/page.tsx',
  'src/app/terms/page.tsx',
  'src/app/privacy/page.tsx',
  'src/app/legal/page.tsx',
]

/** @type {import('eslint').Rule.RuleModule} */
const requirePageHeader = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Marketing/legal routes must use <PageHeader>, not a hand-rolled <h1>',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename()
    const normalized = filename.replace(/\\/g, '/')
    if (!PAGEHEADER_ROUTES.some((route) => normalized.endsWith(route))) return {}

    let importsPageHeader = false

    return {
      ImportDeclaration(node) {
        if (node.source.value === '@/components/ui/PageHeader') {
          importsPageHeader = true
        }
      },
      JSXOpeningElement(node) {
        if (node.name.type === 'JSXIdentifier' && node.name.name === 'h1') {
          context.report({
            node,
            message:
              'This route is documented in CLAUDE.md as a PageHeader route. Use ' +
              '<PageHeader eyebrow="..." title="..." /> instead of a hand-rolled <h1>.',
          })
        }
      },
      'Program:exit'(node) {
        if (!importsPageHeader) {
          context.report({
            node,
            message:
              'This route is documented in CLAUDE.md as a PageHeader route but does not ' +
              'import PageHeader from "@/components/ui/PageHeader".',
          })
        }
      },
    }
  },
}

export default requirePageHeader
