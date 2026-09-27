import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseContract } from '../../scripts/lib/commerce-contract.mjs'
import { parseEgress } from '../../scripts/lib/egress.mjs'
import type { ForbiddenRouteRow } from './routeMatrix'

/**
 * **`COMMERCE-ELIMINATION-CONTRACT.md`, as the E2E suite reads it.**
 *
 * One parse, through the same modules the merge-gate scanner uses, so a spec and the
 * scanner cannot disagree about what a table says. The retired-route matrix is generated
 * from §7 and the egress fixture judges against §12 and §13; before this, the spec kept its
 * own copy of §7 and nothing compared the two, which is how a status written in one place
 * and a different status written in the other both read as the contract.
 *
 * Read at module load, synchronously, because Playwright collects tests by executing spec
 * files: a table that arrived asynchronously would be generated into zero tests, and zero
 * tests looks exactly like a passing file.
 */
const CONTRACT_PATH = path.resolve(__dirname, '../../COMMERCE-ELIMINATION-CONTRACT.md')
const text = readFileSync(CONTRACT_PATH, 'utf8')

const parsed = parseContract(text)

/** §7, one row per retired route family. */
export const forbiddenRoutes = parsed.routesForbidden as ReadonlyArray<ForbiddenRouteRow>

/** §6, one row per route the site serves. */
export const approvedRoutes = parsed.routesApproved as ReadonlyArray<{
  route: string
  kind: 'page' | 'route'
  status: number
}>

/** §12 and §13, compiled. */
export const egressPolicy = parseEgress(text)
