import type {
  CHRAttempt,
  Constraint,
  Cut,
  GoalId,
  Location,
  R,
  StepIdx,
  Time,
  TimedItem,
  V,
  Event
} from './types.mjs';

export function has<
  K, T extends { item: { name: K } }
>(key: K, l: T[]): T | null {
  return l.find(v => v.item.name === key) ?? null;
}

export function all<K, O, I extends {
  item: { name: K }
}>(key: K, f: (v: I) => O, l: I[]): O[] {
  const output: O[] = [];
  l.forEach(v => {
    if (v.item.name === key) {
      output.push(f(v))
    }
  })
  return output;
}

export type NonEmpty<T> = { head: T, tail: T[] };

export class DecodeError extends Error {
  public raw: string

  constructor(message: string, raw: string) {
    super(message)
    this.raw = raw;
  }
}

/**
 * Returns sublists starting with the elements matching a predicate.
 *
 * In particular none of the returned sublists are empty, and the
 * elements of l before the first element matching the predicate are
 * dropped.
 */
export function splitOn<T>(pred: (i: T) => boolean, l: T[]): NonEmpty<T>[] {
  const result: NonEmpty<T>[] = [];
  let tmp: NonEmpty<T> | null = null;

  l.forEach(x => {
    if (pred(x)) {
      // Flush the previous run, if any
      if (tmp) {
        result.push(tmp);
      }
      // Seed the new run
      tmp = { head: x, tail: [] };
    } else if (tmp) {
      // Only push an element if there is a run
      tmp.tail.push(x);
    }
  });

  // Flush the final run
  if (tmp) {
    result.push(tmp);
  }

  return result;
}

export function allChains(
  key: string, prefixes: string[], l: TimedItem[]
): NonEmpty<TimedItem>[] {
  return splitOn(i => i.item.name === key, l).map(v => ({
    head: v.head,
    tail: v.tail.filter(i => prefixes.some(p => i.item.name.startsWith(p)))
  }));
}

export function inferChains(
  key: string, l: TimedItem[]
): NonEmpty<TimedItem>[] {
  return allChains(key, ['user:assign', 'user:backchain:fail-to'], l);
}

export function chrEventChains(
  key: string, l: TimedItem[]
): NonEmpty<TimedItem>[] {
  return allChains(key, [
    'user:assign',
    'user:CHR:rule-failed',
    'user:CHR:rule-fired',
    'user:CHR:rule-remove-constraints',
    'user:subgoal',
    'user:CHR:resumed'
  ], l)
}

export function decodeAttempt(l: TimedItem): { loc: Location, code: string } {
  const [loc, code] = l.item.payload;
  return {
    loc: parseLoc(loc),
    code
  }
}

export function decodeInferEvent(l: TimedItem): Event {
  const p = l.item.payload;
  if (l.item.name === 'user:assign:resume' && p.length === 1) {
    return {
      kind: 'ResumeGoal',
      goals: p[0].split(' ').map(g => Number.parseInt(g))
    }
  }
  if (l.item.name === 'user:backchain:fail-to' && p.length === 1) {
    return {
      kind: 'Fail',
      failedGoal: p[0]
    }
  }
  return {
    kind: 'Assign',
    repr: decodeString(l)
  }
}

export function decodeInferAttempt(
  l: NonEmpty<TimedItem>
): { loc: Location, code: string, events: Event[] } {
  const events = l.tail.map(e => decodeInferEvent(e));
  return {
    events, ...decodeAttempt(l.head)
  }
}

export function decodeCHRTryList(
  l: NonEmpty<TimedItem>[]
): { successful: CHRAttempt[], failed: CHRAttempt[] } {
  const successful: CHRAttempt[] = [];
  const failed: CHRAttempt[] = [];

  l.forEach(({ head: attempt, tail: events }) => {
    const { loc, code } = decodeAttempt(attempt);
    const start = attempt.time;
    const stop = events[events.length - 1].time;

    const assigned: Event[] = [];
    const resumed: GoalId[] = [];
    const removed: GoalId[] = [];

    events.forEach(e => {
      switch (e.item.name) {
        case 'user:assign':
          assigned.push({
            kind: 'Assign',
            repr: decodeString(e)
          })
          break;
        case 'user:CHR:resumed':
          resumed.push(e.item.goal_id)
          break;
        case 'user:CHR:rule-remove-constraints':
          removed.push(...e.item.payload.map(s => Number.parseInt(s)))
          break;
      }
    })

    const decoded = {
      loc, code, timestamp: { start, stop }, events: assigned, resumed, removed
    };
    if (has('user:CHR:rule-fired', events)) {
      successful.push(decoded);
    } else {
      failed.push(decoded);
    }
  });

  return { successful, failed };
}

export function decodeString(input: TimedItem): string {
  return input.item.payload.join('');
}

export function decodeInt(input: TimedItem): number {
  // TODO: better errors?
  const [s] = input.item.payload;
  return Number.parseInt(s);
}

const ctxRegex = /File "\(context step_id:(?<step>\d+)\)"/;
const fileRegex = /File "(?<name>[^"]+)", line (?<line>\d+), column (?<col>\d+), characters? (?<beg>-?\d+)/;
function parseLoc(input: string): Location {
  let matches = ctxRegex.exec(input);
  if (matches) {
    return {
      kind: 'Context',
      step: Number.parseInt(matches.groups!['step'])
    }
  }
  matches = fileRegex.exec(input);
  if (matches) {
    const groups = matches.groups!;
    return {
      kind: 'File',
      file: {
        filename: groups['name'],
        line: Number.parseInt(groups['line']),
        column: Number.parseInt(groups['col']),
        character: Number.parseInt(groups['beg'])
      }
    };
  }
  throw new DecodeError('Error decoding location', input);
}

export function decodeCut(input: TimedItem): Cut {
  const [g, r, t] = input.item.payload;
  return {
    goalId: Number.parseInt(g),
    loc: parseLoc(r),
    clause: t
  };
}

export function decodeChrStoreEntry(item: TimedItem): Constraint {
  const [gid, gtext] = item.item.payload;
  return {
    id: Number.parseInt(gid),
    text: gtext
  }
}

export type DecodedStep =
  | R<'Suspend', V<TimedItem>>
  | R<'Findall', { origin: TimedItem, start: Time }>
  | R<'Cut', V<TimedItem>>
  | R<'Focus', V<TimedItem>>
  | R<'Resumption', V<TimedItem[]>>
  | R<'CHR', { storeBefore: Constraint[], storeAfter: Constraint[] }>
  | R<'Init', { goalId: GoalId }>
  | R<'Broken', { step: StepIdx, time: Time }>;

export function decodeStep(l: TimedItem[]): DecodedStep {
  const curgoal = has('user:curgoal', l);
  const rule = has('user:rule', l);
  const rulePayload = rule ? decodeString(rule) : null;
  const builtin = has('user:rule:builtin:name', l);
  const builtinName = builtin ? decodeString(builtin) : null;
  const chr = has('user:CHR:try', l);
  const newg = has('user:newgoal', l);
  if (curgoal) {
    if (builtinName === 'declare_constraint' && !chr) {
      return { kind: 'Suspend', value: curgoal };
    }
    if (rulePayload === 'findall' && !chr) {
      return { kind: 'Findall', origin: curgoal, start: rule!.time };
    }
    if (rulePayload === 'cut' && !chr) {
      return { kind: 'Cut', value: curgoal };
    }
    if (!chr) {
      return { kind: 'Focus', value: curgoal };
    }
  } else {
    if (rulePayload === 'resume' && !chr) {
      return {
        kind: 'Resumption',
        value: all('user:rule:resume:resumed', i => i, l)
      };
    }
    if (chr) {
      return {
        kind: 'CHR',
        storeBefore: all('user:CHR:store:before', decodeChrStoreEntry, l),
        storeAfter: all('user:CHR:store:after', decodeChrStoreEntry, l)
      };
    }
    if (!chr && newg) {
      return { kind: 'Init', goalId: newg.item.goal_id };
    }
  }

  const x = l[0];
  return {
    kind: 'Broken',
    step: x.item.step,
    time: x.time
  };
}
