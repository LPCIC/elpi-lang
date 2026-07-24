import type { Item } from './trace_v2.mjs';

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

export type TimedItem = {
  item: Item,
  time: Time
};

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

export type RawStep = {
  timestamp: Timestamp,
  items: TimedItem[]
};
