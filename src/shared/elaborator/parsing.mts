import { readItem as readItem1 } from './trace_v1.mjs';
import { readItem as readItem2 } from './trace_v2.mjs';
import StepMap from './StepMap.mjs';
import type { Timed, Timestamped, ParsedTrace } from './types.mjs';

export type Parsable = {
  kind: { kind: string }[],
  step: number,
  runtime_id: number,
};
export type Parser<T extends Parsable> = (x: any) => T;
export type Parsed<T> = Timestamped<{ items: Timed<{ item: T }>[] }>;

function runParser<T extends Parsable>(parser: Parser<T>, input: string): StepMap<Parsed<T>> {
  const steps: StepMap<Parsed<T>> = new StepMap();

  let tick = 0;
  input.split(/\n/).forEach(line => {
    if (!line) return;

    const item = parser(JSON.parse(line));
    if (item.kind.length !== 1 || item.kind[0]?.kind !== 'Info')
      return;

    tick += 1;
    const id = { step: item.step, runtime: item.runtime_id };
    const next = steps.get(id) ?? {
      timestamp: { start: tick, stop: tick },
      items: []
    };
    next.timestamp.stop = tick;
    next.items.push({
      time: tick,
      item
    });

    steps.set(id, next)
  })

  return steps;
}

export function parseTrace(input: string): ParsedTrace {
  try {
    return { kind: 'V2', value: runParser(readItem2, input) }
  } catch {
    try {
      return { kind: 'V1', value: runParser(readItem1, input) }
    } catch (e) {
      throw new Error('Trace format not recognized')
    }
  }
}
