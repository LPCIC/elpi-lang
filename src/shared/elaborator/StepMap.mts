import type { StepId, StepIdx, RuntimeId } from './types.mjs';

// Unfortunately arrays and objects are compared for equality by
// reference, so we can't just use a Map with pairs as keys like the
// OCaml implementation does. Instead we implement this helper class.

export default class StepMap<T> {
  // Store runtime id on the outside, since we want to use that as the
  // first key in lexicographic ordering
  store: Map<RuntimeId, Map<StepIdx, T>>
  constructor(data?: { store: Map<RuntimeId, Map<StepIdx, T>> }) {
    this.store = data?.store ?? new Map();
  }

  get(key: StepId): T | undefined {
    return this.store.get(key.runtime)?.get(key.step)
  }

  set(key: StepId, value: T): StepMap<T> {
    const runtimeMap = this.store.get(key.runtime) ?? new Map();
    runtimeMap.set(key.step, value);
    this.store.set(key.runtime, runtimeMap)
    return this;
  }

  get size(): number {
    let size = 0;
    this.store.forEach(stepMap => {
      size += stepMap.size;
    })
    return size;
  }

  forEach(callbackFn: (value: T, index: StepId, map: StepMap<T>) => void) {
    this.store.forEach((runtimeMap, runtimeIdx) => {
      runtimeMap.forEach((v, stepIdx) => {
        callbackFn(v, { step: stepIdx, runtime: runtimeIdx }, this)
      })
    })
  }

  increasing(): SortedStepMap<T> {
    return new SortedStepMap(
      this.sorted((r1, r2) => r1 - r2, (s1, s2) => s1 - s2)
    );
  }

  decreasing(): StepMap<T> {
    return this.sorted((r1, r2) => r2 - r1, (s1, s2) => s2 - s1)
  }

  private sorted(
    cmpRuntime: (left: RuntimeId, right: RuntimeId) => number,
    cmpStep: (left: StepIdx, right: StepIdx) => number
  ): StepMap<T> {
    const runtimes = [...this.store.entries()];
    // Sort runtimes descending
    runtimes.sort(([r1], [r2]) => cmpRuntime(r1, r2));
    // Sort steps descending
    runtimes.forEach(entry => {
      const steps = [...entry[1].entries()];
      steps.sort(([s1], [s2]) => cmpStep(s1, s2));
      entry[1] = new Map(steps)
    })
    return new StepMap({ store: new Map([...runtimes]) })
  }
}

export class SortedStepMap<T> extends StepMap<T> {
  constructor(sorted: StepMap<T>) {
    super(sorted)
  }
}
