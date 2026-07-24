import { readItem, Trace as TraceV2 } from './trace_v2.mjs';

import * as A from './analysis.mjs';
import * as E from './elaboration.mjs';
import * as C from './presentation.mjs';
import StepMap from './StepMap.mjs';
import type { RawStep } from './types.mjs';

function readTrace(input: string): StepMap<RawStep> {
  const steps: StepMap<RawStep> = new StepMap();

  let tick = 0;
  input.split(/\n/).forEach(line => {
    if (!line) return;
    const item = readItem(JSON.parse(line));
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

// TODO: handle version 1
export function elaborate(input: string): TraceV2 {
  const raw = readTrace(input);
  const elaborated = E.elaborateSteps(raw);
  const analysis = A.analyze(elaborated.steps);
  const cards = C.materialize(elaborated, analysis);
  return cards;
}
