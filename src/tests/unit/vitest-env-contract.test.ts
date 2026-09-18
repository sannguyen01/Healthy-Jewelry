import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'
import ts from 'typescript'
import { parseSource, walk } from '@/lib/analysis/tsAstScan'

/**
 * **The local command and the merge gate must ask the same question.**
 *
 * ## What went wrong
 *
 * `src/config`'s modules are almost entirely `process.env.X ?? fallback`. Each
 * of those is a branch, and which side runs is a property of the *environment*,
 * not of the tests. `ci.yml` sets five mock credentials at workflow scope plus
 * `NEXT_PUBLIC_SITE_URL` on the unit step; a developer sandbox has none of them.
 * So the same suite exercised the fallback arm in one place and the value arm in
 * the other, and neither run touched both.
 *
 * Under a project-wide coverage threshold that was invisible — the aggregate
 * absorbed it. With `thresholds.perFile` on it became the difference between
 * green and red, and on 2026-09-18 a branch passed locally with zero coverage
 * errors and failed CI three pushes running:
 *
 *     ERROR: Coverage for branches (70%)    … src/config/build-info.ts
 *     ERROR: Coverage for branches (50%)    … src/config/shopify-public.ts
 *     ERROR: Coverage for branches (66.66%) … src/config/shopify.ts
 *
 * Two fixes, and both were needed. `config-env-branches.test.ts` stubs both arms
 * of every one of those reads, so the number no longer depends on the ambient
 * environment at all — that is the real one. `vitest.config.ts`'s `env` block is
 * the second: it makes `pnpm test:coverage` and the gate run under identical
 * conditions, so the next such difference shows up before a push instead of
 * after it.
 *
 * This file is what stops those two declarations drifting apart. Two copies of
 * one fact with nothing joining them is the shape this repository keeps paying
 * for — the collections cache tag, the API version, the contrast ratio beside
 * the wrong swatch.
 *
 * ## Read as values, not as text
 *
 * `vitest.config.ts` through the TypeScript AST and `ci.yml` through a YAML
 * parser, because a regex would compare the presence of a string rather than the
 * value of a setting
 * ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)),
 * and importing the vitest config under jsdom fails — it pulls in
 * `@vitejs/plugin-react`, which loads esbuild, which refuses to initialise there.
 */

const ROOT = resolve(__dirname, '../../..')
const CI = join(ROOT, '.github/workflows/ci.yml')

/** `test.env` from `vitest.config.ts`, as real strings. */
function vitestEnv(): Record<string, string> {
  const source = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8')
  let testObject: ts.ObjectLiteralExpression | null = null

  walk(parseSource('vitest.config.ts', source), (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'test' &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      testObject = node.initializer
    }
  })
  if (!testObject) return {}

  const out: Record<string, string> = {}
  for (const prop of (testObject as ts.ObjectLiteralExpression).properties) {
    if (
      !ts.isPropertyAssignment(prop) ||
      !ts.isIdentifier(prop.name) ||
      prop.name.text !== 'env' ||
      !ts.isObjectLiteralExpression(prop.initializer)
    ) {
      continue
    }
    for (const entry of prop.initializer.properties) {
      if (
        ts.isPropertyAssignment(entry) &&
        (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name)) &&
        ts.isStringLiteralLike(entry.initializer)
      ) {
        out[entry.name.text] = entry.initializer.text
      }
    }
  }
  return out
}

type Step = { name?: string; run?: string; env?: Record<string, unknown> }
type Job = { steps?: Step[] }
type Ci = { env?: Record<string, unknown>; jobs?: Record<string, Job> }

const ci = parse(readFileSync(CI, 'utf8')) as Ci

/** Workflow-scope env, plus whatever the step that runs vitest adds. */
function ciUnitEnv(): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const [key, value] of Object.entries(ci.env ?? {})) merged[key] = String(value)

  for (const job of Object.values(ci.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (typeof step.run !== 'string' || !/vitest/.test(step.run)) continue
      for (const [key, value] of Object.entries(step.env ?? {})) merged[key] = String(value)
    }
  }
  return merged
}

const declared = vitestEnv()
const fromCi = ciUnitEnv()

describe('both sides parse', () => {
  it('vitest.config.ts declares a test.env block', () => {
    expect(
      Object.keys(declared).length,
      'vitest.config.ts declares no `test.env`. Without it, `pnpm test:coverage` measures ' +
        'a different set of branches from the merge gate — which with thresholds.perFile ' +
        'on is the difference between green and red, and is how three config files failed ' +
        'CI three pushes running while every local run was clean.'
    ).toBeGreaterThan(0)
  })

  it('ci.yml supplies an environment to the step that runs vitest', () => {
    expect(Object.keys(fromCi).length).toBeGreaterThan(0)
  })
})

describe('the two declarations agree', () => {
  it('every variable CI sets for the unit run is declared in vitest.config.ts', () => {
    const missing = Object.keys(fromCi).filter((key) => !(key in declared))
    expect(
      missing,
      `ci.yml sets ${missing.join(', ')} for the unit run and vitest.config.ts does not. A ` +
        `contributor running the documented local command gets a different answer from the ` +
        `gate, silently, and only for the branches that variable controls.`
    ).toEqual([])
  })

  it('every declared variable has CI’s value, not a different one', () => {
    const disagreements = Object.entries(declared)
      .filter(([key]) => key in fromCi)
      .filter(([key, value]) => fromCi[key] !== value)
      .map(([key, value]) => `${key}: vitest="${value}" ci="${fromCi[key]}"`)

    expect(
      disagreements,
      'vitest.config.ts and ci.yml set the same variable to different values. Whichever is ' +
        'wrong, the two runs are measuring different code.'
    ).toEqual([])
  })

  it('declares nothing CI does not, so local is never the more permissive of the two', () => {
    // The asymmetry matters. A variable set locally and absent in CI makes the
    // local run the weaker gate — the direction that lets a failure through to
    // the merge gate rather than catching it before the push.
    const extra = Object.keys(declared).filter((key) => !(key in fromCi))
    expect(
      extra,
      `vitest.config.ts declares ${extra.join(', ')}, which ci.yml does not set for the ` +
        `unit run. Add it to the workflow or remove it here — a local environment richer ` +
        `than the gate's is how a green local run stops being evidence.`
    ).toEqual([])
  })
})

describe('nothing in it is a real credential', () => {
  it('every value is recognisably a mock', () => {
    // A unit run must never reach a real store, and a credential that works has
    // no business being reachable from a test. Asserted rather than assumed,
    // because this block is now the thing that decides what a test process can
    // see.
    const suspicious = Object.entries(declared)
      .filter(([key]) => /TOKEN|SECRET|KEY/.test(key))
      .filter(([, value]) => !/^mock/i.test(value))
      .map(([key]) => key)

    expect(
      suspicious,
      `vitest.config.ts sets ${suspicious.join(', ')} to something that does not look like ` +
        `a mock. Test configuration is committed; a working credential in it is a leaked one.`
    ).toEqual([])
  })
})
