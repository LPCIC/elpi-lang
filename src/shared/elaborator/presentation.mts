// TODO: this should end up in types
import type * as C from './trace_v2.mjs';

import Unreachable from '../unreachable.mjs';
import * as A from './analysis.mjs';
import * as E from './elaboration.mjs';
import StepMap from './StepMap.mjs';
import type {
  CHRAttempt,
  Constraint,
  Event,
  GoalId,
  GoalMap,
  Location,
  R,
  RuntimeId,
  StepId,
  StepIdx,
  Time,
  Timestamp,
  V
} from './types.mjs';

export class CardError extends Error {
  constructor(message: string) {
    super(message)
  }
}

function getGoalText<T>(key: GoalId, map: GoalMap<T>): T {
  const result = map.get(key);
  if (!result)
    throw new CardError(`Goal text not found for goal ${key}`);
  return result;
}

function getStack(key: StepId, map: StepMap<E.Stack>): E.Stack {
  const result = map.get(key);
  if (!result)
    throw new CardError(`Stack not found for step ${key}`);
  return result;
}

type PreCut = {
  goalId: GoalId,
  goal: string,
  cutBranch: {
    clause: string,
    loc: Location
  }
};

type Attempt = {
  rule: E.Rule,
  events: Event[]
}

type SuccessfulAttempt = {
  attempt: Attempt,
  siblings: { goalId: GoalId, goal: string }[],
  siblingsOutcome: 'Fail' | 'Success'
}

type Inference = {
  goalId: GoalId,
  goal: string,
  predicate: string,
  failed: Attempt[],
  successful: { current: SuccessfulAttempt, more: StepIdx[] } | null,
  moreFailed: StepIdx[],
  stack: E.Stack
};

type PreStep =
  | R<'Init', { goalId: GoalId, goal: string }>
  | R<'Findall_TODO', { goal: string, goalId: GoalId, timestamp: Timestamp, result: string[] }>
  | R<'CHR_TODO', { failed: CHRAttempt[], successful: CHRAttempt[], storeBefore: Constraint[], storeAfter: Constraint[] }>
  | R<'Cut', { goalId: GoalId, cuts: PreCut[] }>
  | R<'Resume', V<{ goalId: GoalId, goal: string }[]>>
  | R<'Suspend', {
    goalId: GoalId,
    goal: string,
    siblingId: GoalId,
    sibling: string,
    stack: E.Stack
  }>
  | R<'Inference', Inference>;

type PreCard = {
  timestamp: Timestamp,
  stepId: StepId,
  step: PreStep
};

type Color = C.Color['kind'];

function contained(outer: Timestamp, inner: Timestamp): boolean {
  return outer.start < inner.start && inner.stop <= outer.stop
}

const toColor = (color: Color): C.Color => ({ kind: color })

const toGoal = (g: {goalId: GoalId, goal: string}) => ({
  goal_id: g.goalId,
  goal_text: g.goal
});
const toConstraint = (c: Constraint): C.Goal => ({
  goal_id: c.id,
  goal_text: c.text
})
const toLoc = (l: Location): C.Location => {
  if (l.kind === 'Context') {
    return { kind: 'Context', value: l.step }
  }
  if (l.kind === 'File') {
    return { kind: 'File', value: l.file }
  }
  throw new Unreachable(l)
}
const toRule = (r: E.Rule): C.Rule => {
  if (r.kind === 'BuiltinRule') {
    return {
      kind: 'BuiltinRule',
      value: { ...r.value, kind: { kind: r.value.kind } }
    }
  }
  if (r.kind === 'UserRule') {
    return {
      kind: 'UserRule',
      value: { rule_text: r.value.ruleText, rule_loc: toLoc(r.value.ruleLoc) }
    }
  }
  throw new Unreachable(r)
}
const toEvent = (e: Event): C.Event => {
  if (e.kind === 'Assign') {
    return { kind: 'Assign', value: e.repr }
  }
  if (e.kind === 'Fail') {
    return { kind: 'Fail', value: e.failedGoal }
  }
  if (e.kind === 'ResumeGoal') {
    return { kind: 'ResumeGoal', value: e.goals }
  }
  throw new Unreachable(e)
};
const toAttempt = (a: Attempt): C.Attempt => ({
  rule: toRule(a.rule),
  events: a.events.map(toEvent)
})
const toSuccess = (e: SuccessfulAttempt): C.SuccessfulAttempt => ({
  attempt: toAttempt(e.attempt),
  siblings: e.siblings.map(toGoal),
  siblings_aggregated_outcome: { kind: e.siblingsOutcome }
})
const toFrame = (e: E.Frame): C.Frame => ({
  rule: toRule(e.rule),
  step_id: e.stepId.step,
  runtime_id: e.stepId.runtime
});

export function materialize(
  elaboration: E.Elaboration,
  analysis: A.Analysis
): C.Trace {
  const preCards: PreCard[] = [];
  const broken: { step: StepIdx, time: Time }[] = [];
  let maxStepIdx = Number.MIN_SAFE_INTEGER;
  let minRuntimeIdx = Number.MAX_SAFE_INTEGER;

  // TODO: Some of the later processing might be merged into this pass
  elaboration.steps.forEach(({ timestamp, step }, stepId) => {
    let preStep: PreStep;
    switch (step.kind) {
      case 'Broken':
        broken.push({ time: step.time, step: step.step })
        return
      case 'Resume':
        preStep = step;
        break;
      case 'Findall':
        preStep = { ...step, kind: 'Findall_TODO' }
        break;
      case 'CHR':
        preStep = { ...step, kind: 'CHR_TODO' }
        break;
      case 'Init':
        preStep = {
          ...step,
          goal: getGoalText(step.goalId, elaboration.goalText)
        }
        break;
      case 'Cut':
        preStep = {
          kind: 'Cut',
          goalId: step.goalId,
          cuts: step.cut.map(c => ({
            goalId: c.goalId,
            goal: getGoalText(c.goalId, elaboration.goalText),
            cutBranch: {
              clause: c.clause,
              loc: c.loc
            }
          }))
        }
        break;
      case 'Suspend':
        preStep = {
          kind: 'Suspend',
          goalId: step.goalId,
          goal: getGoalText(step.goalId, elaboration.goalText),
          siblingId: step.sibling,
          sibling: getGoalText(step.sibling, elaboration.goalText),
          stack: getStack(stepId, elaboration.stackFrames)
        }
        break
      case 'Inference': {
        let failed: Attempt[];
        let successful: SuccessfulAttempt | null;

        const mkSuccess = (rule: E.Rule, events: Event[], siblings: GoalId[]): SuccessfulAttempt => ({
          attempt: { rule, events },
          siblings: siblings.map(g => ({
            goalId: g,
            goal: getGoalText(g, elaboration.goalText)
          })),
          siblingsOutcome: siblings.every(
            s => analysis.successful.has(s)
          ) ? 'Success' : 'Fail'
        });
        const mkFailed = (attempts: E.Attempt[]): Attempt[] => attempts.map(a => ({
          rule: {
            kind: 'UserRule',
            value: { ruleText: a.code, ruleLoc: a.loc }
          },
          events: a.events
        }))

        if (step.action.kind === 'Builtin') {
          if (step.action.outcome.kind === 'Fail') {
            failed = [{
              rule: { kind: 'BuiltinRule', value: step.action.name },
              events: step.action.events
            }]
            successful = null
          } else if (step.action.outcome.kind === 'Success') {
            successful = mkSuccess(
              { kind: 'BuiltinRule', value: step.action.name },
              step.action.events,
              step.action.outcome.siblings
            )
            failed = []
          } else {
            throw new Unreachable(step.action.outcome)
          }
        } else if (step.action.kind === 'Backchain') {
          if (step.action.outcome.kind === 'Fail') {
            failed = mkFailed(step.action.trylist)
            successful = null
          } else if (step.action.outcome.kind === 'Success') {
            const attempts = [...step.action.trylist];
            const { loc, code, events } = attempts.pop()!;
            successful = mkSuccess(
              { kind: 'UserRule', value: { ruleText: code, ruleLoc: loc } },
              events,
              step.action.outcome.siblings,
            )
            failed = mkFailed(attempts)
          } else {
            throw new Unreachable(step.action.outcome)
          }
        } else {
          throw new Unreachable(step.action);
        }

        // TODO: merge these nicely
        const moreFailed = analysis.attempts.get(step.goalId)?.failing
          .filter(i => i.runtime === stepId.runtime && i.step > stepId.step)
          .map(i => i.step) ?? [];
        moreFailed.sort();
        const moreSuccessful = analysis.attempts.get(step.goalId)?.successful
          .filter(i => i.runtime === stepId.runtime && i.step > stepId.step)
          .map(i => i.step) ?? [];
        moreSuccessful.sort();
        // TODO: assert that no successful -> no more successful
        preStep = {
          kind: 'Inference',
          goalId: step.goalId,
          goal: step.goal,
          predicate: step.pred,
          failed,
          successful: successful ? {
            current: successful,
            more: moreSuccessful
          } : null,
          moreFailed,
          stack: getStack(stepId, elaboration.stackFrames)
        }
        break;
      }
      default:
        throw new Unreachable(step)
    }

    maxStepIdx = Math.max(maxStepIdx, stepId.step)
    minRuntimeIdx = Math.min(minRuntimeIdx, stepId.runtime)
    preCards.push({ timestamp, stepId, step: preStep })
  })

  // TODO: why is it okay only if there's exactly one old broken step?
  if (broken.length !== 0) {
    if (broken.length > 1 || broken[0]!.step < maxStepIdx) {
      const { step, time } = broken[0]!;
      throw new CardError(
        `Input trace is broken since step_id ${step}, json object ${time}`
      )
    }
  }

  const toChrAttempt = (a: CHRAttempt): C.ChrAttempt => {
    if (a.loc.kind !== 'File')
      throw new CardError(`CHR attempt had a non-file location ${a.loc}`);
    // TODO: port sanity checks
    return {
      chr_loc: a.loc.file,
      chr_text: a.code,
      chr_condition_cards: preCards
        .filter(p => contained(a.timestamp, p.timestamp))
        .map(preCardToCard)
    }
  };

  const toSuccessfulChrAttempt = (a: CHRAttempt): C.SuccessfulChrAttempt => {
    const attempt = toChrAttempt(a);
    return {
      chr_attempt: attempt,
      chr_removed_goals: a.removed,
      chr_new_goals: a.resumed.map(g => ({
        goal_id: g,
        goal_text: getGoalText(g, elaboration.goalText)
      }))
    }
  }

  const inferenceColor = (rid: RuntimeId, { successful }: Inference): Color => {
    if (!successful) {
      return 'Red';
    }
    if (successful.current.siblingsOutcome === 'Success') {
      if (successful.more.length === 0) {
        return 'Green'
      } else {
        return 'YellowGreen'
      }
    }
    if (successful.current.siblingsOutcome === 'Fail') {
      if (successful.more.length === 0) {
        return 'YellowRed';
      } else {
        const last = successful.more.at(-1);
        const lastCard = preCards.find(c => c.stepId.runtime === rid && c.stepId.step === last)
        if (!lastCard) {
          throw new CardError(`Last successful sibling [${rid}, ${last}] does not have a card`);
        }
        if (lastCard.step.kind !== 'Inference') {
          throw new CardError(`Last successful sibling [${rid}. ${last}] is not an inference`)
        }
        const lastColor = inferenceColor(rid, lastCard.step);
        if (lastColor === 'Green') {
          return 'YellowGreen'
        }
        if (lastColor === 'Red') {
          return 'YellowRed'
        }
        return lastColor
      }
    }
    throw new Unreachable(successful.current.siblingsOutcome)
  }

  const preCardToCard = ({ step, stepId }: PreCard): C.Card => {
    const base = { step_id: stepId.step, runtime_id: stepId.runtime };
    switch (step.kind) {
      case 'Init':
        return {
          ...base,
          step: { kind: 'Init', value: toGoal(step) },
          color: { kind: 'Grey' }
        }
      case 'Resume':
        return {
          ...base,
          step: { kind: 'Resume', value: step.value.map(toGoal) },
          color: { kind: 'Grey' }
        }
      case 'Inference':
        return {
          ...base,
          step: { kind: 'Inference', value: {
            current_goal_id: step.goalId,
            current_goal_text: step.goal,
            current_goal_predicate: step.predicate,
            failed_attempts: step.failed.map(toAttempt),
            successful_attempts: step.successful ? [toSuccess(step.successful.current)] : [],
            more_failing_attempts: step.moreFailed,
            more_successful_attempts: step.successful?.more ?? [],
            stack: step.stack.map(toFrame)
          } },
          color: toColor(inferenceColor(stepId.runtime, step))
        }
      case 'Suspend':
        return {
          ...base,
          step: { kind: 'Suspend', value: {
            suspend_goal_id: step.goalId,
            suspend_goal_text: step.goal,
            suspend_sibling: {
              goal_id: step.siblingId,
              goal_text: step.sibling
            },
            suspend_stack: step.stack.map(toFrame)
          } },
          color: { kind: 'Grey' }
        }
      case 'Cut':
        return {
          ...base,
          step: { kind: 'Cut', value: {
            cut_goal_id: step.goalId,
            cut_victims: step.cuts.map(c => ({
              cut_branch_for_goal: {
                goal_id: c.goalId,
                goal_text: c.goal
              },
              cut_branch: {
                rule_text: c.cutBranch.clause,
                rule_loc: toLoc(c.cutBranch.loc)
              }
            }))
          } },
          color: { kind: 'Grey' }
        }
      case 'CHR_TODO':
        return {
          ...base,
          step: { kind: 'CHR', value: {
            chr_failed_attempts: step.failed.map(toChrAttempt),
            chr_successful_attempts: step.successful.map(toSuccessfulChrAttempt),
            chr_store_before: step.storeBefore.map(toConstraint),
            chr_store_after: step.storeAfter.map(toConstraint)
          } },
          color: { kind: 'Grey' }
        }
      case 'Findall_TODO':
        return {
          ...base,
          step: { kind: 'Findall', value: {
            findall_goal_id: step.goalId,
            findall_goal_text: step.goal,
            findall_cards: preCards
              .filter(p => contained(step.timestamp, p.timestamp))
              .map(preCardToCard),
            findall_solution_text: step.result,
            findall_stack: getStack(stepId, elaboration.stackFrames).map(toFrame)
          } },
          color: { kind: 'Green' }
        }
      default:
        throw new Unreachable(step)
    }
  }

  return preCards.filter(c => c.stepId.runtime === minRuntimeIdx).map(preCardToCard)
}
