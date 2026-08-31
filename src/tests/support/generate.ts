/**
 * **Renderings of one input, so a parser can be asked whether it reads the meaning or the
 * formatting.**
 *
 * Hand-rolled, matching the fuzz precedent in `production-smoke-handles.test.ts`: a
 * cross-product of shapes rather than a property-testing library. A new devDependency here
 * would need its own dependabot reasoning, its own major-bump policy, and its own place in
 * the lockfile — cost out of proportion to a few hundred generated strings.
 *
 * The generators below are deliberately *equivalent*, not random. Randomness finds crashes;
 * what these parsers fail at is quieter than a crash — they return a subset and the check
 * silently narrows. So each function produces documents a maintainer would consider
 * identical, and the property is that the parse does too.
 */

/* --------------------------------------------------------------- shell command renderings */

/**
 * The same `node <script> ARG…` invocation, written the ways a person plausibly writes it.
 *
 * The last few are the ones that mattered: the original regex required one argument per
 * line, each backslash-continued, and would return a *partial* list — not an empty one —
 * when the tail was formatted differently.
 */
export function shellRenderings(script: string, args: string[], tail = '2>&1 | tee out.log'): Array<[string, string]> {
  const one = args.join(' ')
  const continued = args.map((a) => `  ${a} \\`).join('\n')
  const continuedTight = args.map((a) => `${a} \\`).join('\n')

  return [
    ['one line', `node ${script} ${one} ${tail}`],
    ['one line, no tail', `node ${script} ${one}`],
    ['continued, indented', `node ${script} \\\n${continued}\n  ${tail}`],
    ['continued, unindented', `node ${script} \\\n${continuedTight}\n${tail}`],
    ['continued, deep indent', `node ${script} \\\n${args.map((a) => `        ${a} \\`).join('\n')}\n        ${tail}`],
    ['extra blank-ish spacing', `node   ${script}   ${one}   ${tail}`],
    ['preceded by another command', `set -u\nnode ${script} ${one} ${tail}`],
    ['followed by another command', `node ${script} ${one}\necho done`],
    ['tail on the same line as the last arg', `node ${script} \\\n${continued.slice(0, -2)} ${tail}`],
  ]
}

/* ------------------------------------------------------------------ YAML value renderings */

/**
 * One scalar value, written as YAML expresses it.
 *
 * `>-` folds newlines into spaces and `|-` keeps them, so a condition split across lines
 * reaches the parser differently in each. Both are legal and both appear in real workflows.
 */
export function scalarRenderings(value: string): Array<[string, string]> {
  const escaped = value.replace(/'/g, "''")
  return [
    ['plain', value.includes(': ') ? `"${value.replace(/"/g, '\\"')}"` : value],
    ['single-quoted', `'${escaped}'`],
    ['double-quoted', `"${value.replace(/"/g, '\\"')}"`],
    ['folded', `>-\n            ${value}`],
    ['literal', `|-\n            ${value}`],
  ]
}

/**
 * A minimal but valid workflow carrying one step-level condition, rendered every way.
 */
export function workflowsWithCondition(condition: string): Array<[string, string]> {
  return scalarRenderings(condition).map(([label, rendered]) => [
    label,
    [
      'name: Generated',
      'on: push',
      'jobs:',
      '  audit:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: Report',
      `        if: ${rendered}`,
      '        run: echo hi',
      '',
    ].join('\n'),
  ])
}

/* --------------------------------------------------------------------- app router trees */

export type Tree = { [name: string]: Tree | null }

/** Turns a nested literal into the `ReadDir` the route walk takes. A `null` value is a file. */
export function treeReader(tree: Tree) {
  return (relative: string) => {
    let node: Tree = tree
    if (relative !== '') {
      for (const segment of relative.split('/')) {
        const next = node[segment]
        if (next === null || next === undefined) return []
        node = next
      }
    }
    return Object.entries(node).map(([name, value]) => ({ name, isDirectory: value !== null }))
  }
}
