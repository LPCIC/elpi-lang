import type { Item as Item1 } from './trace_v1.mjs';
import type { Item as Item2 } from './trace_v2.mjs';
export type { Item as Item1 } from './trace_v1.mjs';
export type { Item as Item2 } from './trace_v2.mjs';
import type StepMap from './StepMap.mts';

export type V<K> = { value: K };
export type R<K extends string, Rec = {}> = { kind: K } & Rec;

export type StepIdx = number;
export type RuntimeId = number;
export type StepId = {
  step: StepIdx,
  runtime: RuntimeId
}

export type GoalId = number;

export type Time = number;
export type Timestamp = { start: Time; stop: Time };

export type Timed<R> = R & {
  time: Time
};

export type Timestamped<R> = R & {
  timestamp: Timestamp
}

export type FileLocation = {
  filename: string,
  line: number,
  column: number,
  character: number
}

export type Location =
  | R<'File', { file: FileLocation }>
  | R<'Context', { step: StepIdx }>

export type Constraint = {
  id: GoalId,
  text: string
}

export type Event =
  // repr is a string representation, e.g. "A0 := X0"
  | R<'Assign', { repr: string }>
  | R<'Fail', { failedGoal: string }>
  | R<'ResumeGoal', { goals: GoalId[] }>;

export type Cut = {
  goalId: GoalId,
  loc: Location,
  clause: string
};

export type CHRAttempt = {
  loc: Location,
  code: string,
  events: Event[],
  timestamp: Timestamp,
  removed: GoalId[],
  resumed: GoalId[]
}

// Note: some of the Map operations can be cleaner with the new API
// available in Node 26

export type GoalMap<T> = Map<GoalId, T>;
export type GoalSet = Set<GoalId>;

export type RawStep1 = Timestamped<{ items: Timed<{ item : Item1 }>[]}>;
export type RawStep2 = Timestamped<{ items: Timed<{ item : Item2 }>[]}>;

export type ParsedTrace =
  | R<'V1', V<StepMap<RawStep1>>>
  | R<'V2', V<StepMap<RawStep2>>>;
