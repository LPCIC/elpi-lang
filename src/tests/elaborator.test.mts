import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { suite, test } from 'node:test';

import * as E from '../shared/elaborator/index.mjs';
// TODO: compare IR instead of the ATD format
import { writeTrace } from '../shared/elaborator/trace_v2.mjs';

// Relative to the output directory
const testSources = path.join(import.meta.dirname, '../../src/tests/sources')

const traces = [
  'trace_chr',
  'trace',
  'trace2',
  'trace3',
  'trace4',
  'trace_w',
  'trace_cut',
  'trace_findall',
  'trace_implication',
  'broken_trace1',
].map(t => ({ source: t, target: `${t}.elab` }))

const brokenTraces = [
  {
    source: 'broken_trace2',
    validate: /Input trace is broken since step_id 217, json object 1857$/
  }
];

function getTraceFile(name: string): string {
  return path.join(testSources, `${name}.json`)
}

function getTrace(name: string): Promise<string> {
  return fs.readFile(getTraceFile(name), 'utf-8')
}

suite('Successful elaboration tests', () => {
  traces.forEach(({ source, target }) => {
    test(`Elaborate ${source}`, async t => {
      const input = await getTrace(source);

      const elaborated = E.elaborate(input);
      t.assert.fileSnapshot(
        elaborated,
        getTraceFile(target),
        { serializers: [
          writeTrace,
          v => JSON.stringify(v, undefined, 2)
        ] }
      )
    })
  })
})

suite('Failing elaboration tests', () => {
  brokenTraces.forEach(({ source, validate }) => {
    test(`Fail elaboration of ${source}`, async t => {
      const input = await getTrace(source);
      t.assert.throws(() => E.elaborate(input), validate)
    })
  })
})
