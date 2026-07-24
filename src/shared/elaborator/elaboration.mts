import Unreachable from '../unreachable.mjs';
import * as D from './decoding.mjs';
import StepMap, { SortedStepMap } from './StepMap.mjs';
import type {
  CHRAttempt,
  Constraint,
  Cut,
  Event,
  GoalId,
  GoalMap,
  Location,
  R,
  RawStep,
  StepId,
  StepIdx,
  Time,
  TimedItem,
  Timestamp,
  V
} from './types.mjs';


export type Outcome =
  | R<'Success', { siblings: GoalId[] }>
  | R<'Fail'>;

type BuiltinRule = {
  name: string,
  kind: 'Logic' | 'FFI',
  payload: string[]
};

type UserRule = {
  ruleText: string,
  ruleLoc: Location,
};

export type Rule =
  | R<'BuiltinRule', V<BuiltinRule>>
  | R<'UserRule', V<UserRule>>;

export type Attempt = {
  loc: Location,
  code: string,
  events: Event[]
};

type Action =
  | R<'Builtin', { name: BuiltinRule, outcome: Outcome, events: Event[] }>
  | R<'Backchain', { trylist: Attempt[], outcome: Outcome }>

export type ResumeStep = R<'Resume', V<{ goalId: GoalId, goal: string }[]>>;
export type Step =
  | R<'Init', { goalId: GoalId }>
  | R<'Findall', { goal: string, goalId: GoalId, timestamp: Timestamp, result: string[] }>
  | R<'Inference', { goal: string, pred: string, goalId: GoalId, action: Action, rid: number }>
  | R<'Suspend', { goal: string, goalId: GoalId, sibling: GoalId }>
  | R<'Cut', { goalId: GoalId, cut: Cut[] }>
  | ResumeStep
  | R<'CHR', { failed: CHRAttempt[], successful: CHRAttempt[], storeBefore: Constraint[], storeAfter: Constraint[] }>
  | R<'Broken', { step: StepIdx, time: Time }>;

export type TimedStep = {
  timestamp: Timestamp,
  step: Step
}

class ElaborationError extends Error {
  public step: RawStep;
  constructor(message: string, step: RawStep) {
    super(message);
    this.name = 'ElaborationError';
    this.step = step;
  }
}

function builtinName(l: TimedItem[]): BuiltinRule | null {
  const name = D.has('user:rule:builtin:name', l);
  if (!name)
    return null;
  return {
    kind: 'FFI',
    name: D.decodeString(name),
    payload: []
  }
}

function pushFrame(
  stepId: StepId,
  goalId: GoalId,
  rule: Rule,
  siblings: GoalId[],
  stacks: StepMap<Stack>,
  seedStacks: GoalMap<Stack>
) {
  const thisStack = stacks.get(stepId) ?? seedStacks.get(goalId) ?? [];
  const newStack: Stack = [{ rule, stepId }, ...thisStack];
  stacks.set(stepId, newStack);
  siblings.forEach(g => {
    seedStacks.set(g, newStack);
  })
}

function initPostponedGoalStack(
  stepId: StepId,
  goalId: GoalId,
  rule: Rule,
  seedStacks: GoalMap<Stack>
) {
  // We only update the seed stack: the goals haven't had any progress
  // yet, because we're resuming it just now
  const thisStack = seedStacks.get(goalId) ?? [];
  const newStack: Stack = [{ rule, stepId }, ...thisStack];
  seedStacks.set(goalId, newStack);
}

function pushEndFrame(
  stepId: StepId,
  goalId: GoalId,
  stacks: StepMap<Stack>,
  seedStacks: GoalMap<Stack>
) {
  const thisStack = stacks.get(stepId) ?? seedStacks.get(goalId) ?? [];
  stacks.set(stepId, thisStack)
}

function elaborateStep(
  stepId: StepId,
  step: RawStep,
  stacks: StepMap<Stack>,
  seedStacks: GoalMap<Stack>
): Step {
  const { runtime: rid, step: stepIdx } = stepId;
  const { items } = step;
  if (!items.every(i => i.item.runtime_id === rid)) {
    throw new ElaborationError('Found step with multiple runtime IDs', step);
  }
  const unGoal = (payload: string[]) => {
    if (payload.length !== 2) {
      throw new ElaborationError('Expected a predicate and goal', step);
    }
    return { pred: payload[0]!, goal: payload[1]! };
  }
  const decoded = D.decodeStep(items);
  switch (decoded.kind) {
    case 'Init':
    case 'Broken':
      return decoded;
    case 'Findall': {
      const { goal_id: goalId, payload } = decoded.origin.item;
      const { goal } = unGoal(payload);
      const result = D.all('user:assign', asm => ({
        payload: D.decodeString(asm), time: asm.time
      }), items);
      if (result.length === 0) {
        // TODO: maybe make this a decode error?
        throw new ElaborationError('Findall did not assign the result', step)
      }
      pushFrame(
        stepId,
        goalId,
        {
          kind: 'BuiltinRule',
          value: {
            kind: 'FFI',
            name: 'findall',
            payload: []
          }
        },
        [],
        stacks, seedStacks
      )
      return {
        kind: 'Findall',
        goal, goalId,
        result: result.map(a => a.payload),
        timestamp: { start: decoded.start, stop: result[0]!.time }
      }
    }
    case 'Suspend': {
      const { goal_id: goalId, payload } = decoded.value.item;
      const { goal } = unGoal(payload)
      const siblings = D.all('user:subgoal', D.decodeInt, items);
      if (siblings.length !== 1) {
        throw new ElaborationError(`Suspension expects one subgoal, found ${siblings.length}`, step);
      }
      pushFrame(
        stepId,
        goalId,
        {
          kind: 'BuiltinRule',
          value: {
            kind: 'Logic',
            name: 'suspend',
            payload: []
          }
        },
        siblings,
        stacks, seedStacks
      )
      return {
        kind: 'Suspend',
        goal, goalId, sibling: siblings[0]!
      }
    }
    case 'Cut': {
      const { goal_id: goalId, payload } = decoded.value.item;
      const {} = unGoal(payload)
      const cut = D.all('user:rule:cut:branch', D.decodeCut, items);
      pushFrame(
        stepId,
        goalId,
        {
          kind: 'BuiltinRule',
          value: {
            kind: 'FFI',
            name: '!',
            payload: []
          }
        },
        [],
        stacks, seedStacks
      )
      return {
        kind: 'Cut',
        goalId, cut
      }
    }
    case 'Resumption': {
      const resumed = decoded.value.map(item => {
        const { item: { goal_id: goalId } } = item;
        initPostponedGoalStack(
          stepId,
          goalId,
          {
            kind: 'BuiltinRule',
            value: {
              kind: 'Logic',
              name: 'resume',
              payload: []
            }
          },
          seedStacks
        )
        return { goalId: item.item.goal_id, goal: D.decodeString(item) }
      });
      return {
        kind: 'Resume',
        value: resumed
      };
    }
    case 'CHR': {
      const trylist = D.chrEventChains('user:CHR:try', items);
      const { successful, failed } = D.decodeCHRTryList(trylist);
      const { storeBefore, storeAfter } = decoded;
      return {
        kind: 'CHR',
        successful, failed, storeBefore, storeAfter
      }
    }
    case 'Focus': {
      const { item: { goal_id: goalId, payload }, time } = decoded.value;
      const { pred, goal } = unGoal(payload);
      const rule = D.has('user:rule', items);
      if (!rule || rule.item.payload.length !== 1) {
        throw new ElaborationError('Malformed execution step', step)
      }
      const name = rule.item.payload[0]!;
      const siblings = D.all('user:subgoal', D.decodeInt, items);

      let outcome: Outcome;
      {
        const result = D.has(`user:rule:${name}`, items);
        if (result?.item.payload[0] === 'success') {
          outcome = { kind: 'Success', siblings }
        } else if (result?.item.payload[0] === 'fail') {
          outcome = { kind: 'Fail' }
        } else {
          return {
            kind: 'Broken',
            step: stepIdx,
            time
          };
        }
      }

      let action: Action;
      switch (name) {
        case 'backchain': {
          const trylist = D.inferChains('user:rule:backchain:try', items)
                            .map(c => D.decodeInferAttempt(c));
          if (trylist.length !== 0) {
            const { loc, code } = trylist[0]!;
            pushFrame(
              stepId,
              goalId,
              {
                kind: 'UserRule',
                value: {
                  ruleLoc: loc,
                  ruleText: code
                }
              },
              siblings,
              stacks, seedStacks
            )
          } else {
            if (siblings.length !== 0) {
              throw new ElaborationError('Backchain step has siblings but no attempts left', step)
            }
            pushEndFrame(stepId, goalId, stacks, seedStacks)
          }
          action = {
            kind: 'Backchain',
            trylist, outcome
          }
          break;
        }
        case 'builtin': {
          const name = builtinName(items);
          if (!name) {
            throw new ElaborationError('Builtin has no name', step);
          }
          pushFrame(
            stepId,
            goalId,
            {
              kind: 'BuiltinRule',
              value: name
            },
            siblings,
            stacks,
            seedStacks
          )
          const events = D.inferChains('user:rule:builtin:name', items);
          if (events.length !== 1) {
            throw new ElaborationError(
              `Builtin rule expected to have 1 name, received ${events.length}`,
              step
            )
          }
          action = {
            kind: 'Builtin',
            name, outcome,
            events: events[0]!.tail.map(e => D.decodeInferEvent(e))
          }
          break;
        }
        case 'implication': {
          const newHypsItem = D.has('user:new-hyps', items);
          const newHyps = newHypsItem?.item.payload ?? [];
          pushFrame(
            stepId,
            goalId,
            {
              kind: 'BuiltinRule',
              value: {
                kind: 'Logic',
                name: 'implication',
                payload: newHyps
              }
            },
            siblings,
            stacks,
            seedStacks
          )
          action = {
            kind: 'Builtin',
            name: {
              name,
              kind: 'Logic',
              payload: []
            },
            events: [],
            outcome,
          }
          break;
        }
        default: {
          const ruleName: BuiltinRule = {
            kind: 'Logic',
            name,
            payload: []
          };
          pushFrame(
            stepId,
            goalId,
            {
              kind: 'BuiltinRule',
              value: ruleName
            },
            siblings,
            stacks,
            seedStacks
          )
          const events = D.inferChains('user:rule:builtin:name', items);
          action = {
            kind: 'Builtin',
            name: ruleName,
            events: (events.length !== 0)
              ? events[0]!.tail.map(e => D.decodeInferEvent(e))
              : [],
            outcome
          }
          break;
        }
      }

      return {
        kind: 'Inference',
        goalId, goal, pred, rid, action
      }
    }
    default:
      throw new Unreachable(decoded)
  }
}

export type Frame = {
  rule: Rule,
  stepId: StepId
};

export type Stack = Frame[];

export type Elaboration = {
  steps: SortedStepMap<TimedStep>,
  stackFrames: StepMap<Stack>,
  goalText: GoalMap<string>
};

export function elaborateSteps(steps: StepMap<RawStep>): Elaboration {
  const goals: GoalMap<string> = new Map();
  const elaborated: StepMap<TimedStep> = new StepMap();
  const stacks: StepMap<Stack> = new StepMap();
  const seedStacks: GoalMap<Stack> = new Map();

  steps.forEach((val, key) => {
    val.items.forEach(i => {
      const goal = D.has('user:newgoal', [i]);
      if (goal) {
        goals.set(goal.item.goal_id, D.decodeString(goal));
      }
    })

    elaborated.set(key, {
      timestamp: val.timestamp,
      step: elaborateStep(key, val, stacks, seedStacks)
    });
  });

  return {
    goalText: goals,
    steps: elaborated.increasing(),
    stackFrames: stacks
  }
}
