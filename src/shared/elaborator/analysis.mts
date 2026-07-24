import Unreachable from '../unreachable.mjs';
import * as E from './elaboration.mjs';
import { SortedStepMap } from './StepMap.mjs';
import type {
  GoalId,
  GoalMap,
  GoalSet,
  StepId
} from './types.mjs';

export type GoalAttempt = StepId;
export type GoalAttempts = {
  successful: GoalAttempt[],
  failing: GoalAttempt[]
}

export type Analysis = {
  successful: GoalSet,
  attempts: GoalMap<GoalAttempts>
}

export function analyze(steps: SortedStepMap<E.TimedStep>): Analysis {
  const success: Set<GoalId> = new Set();

  // TODO This is weird: the OCaml implementation's default ordering is decreasing,
  // and then this is iterated in reverse, so in increasing order.
  // But we are analysing siblings, which come after a goal, so they have no
  // chance of being added yet???
  steps.decreasing().forEach(({ step }) => {
    switch (step.kind) {
      case 'Init':
      case 'Broken':
      case 'Resume':
      case 'CHR':
        break;
      case 'Suspend':
      case 'Cut':
      case 'Findall':
        success.add(step.goalId)
        break;
      case 'Inference':
        if (step.action.outcome.kind === 'Fail') {
          break;
        }
        const siblingsSuccessful =
          step.action.outcome.siblings.every(g => success.has(g))
        if (siblingsSuccessful) {
          success.add(step.goalId)
        }
        break;
      default:
        throw new Unreachable(step)
    }
  })

  const attempts: GoalMap<GoalAttempts> = new Map();
  // Steps are already sorted in increasing order
  steps.forEach(({ step }, stepId) => {
    switch (step.kind) {
      case 'Init':
      case 'Broken':
      case 'Resume':
      case 'CHR':
      case 'Suspend':
      case 'Cut':
      case 'Findall':
        break;
      case 'Inference':
        if (step.action.kind === 'Builtin') {
          break;
        }
        // Note: pushing instead of consing, look into consequences
        if (step.action.outcome.kind === 'Success') {
          const prev = attempts.get(step.goalId);
          if (prev) {
            prev.successful.push(stepId);
          } else {
            attempts.set(step.goalId, {
              successful: [stepId],
              failing: []
            });
          }
        }
        if (step.action.outcome.kind === 'Fail') {
          const prev = attempts.get(step.goalId);
          if (prev) {
            prev.failing.push(stepId);
          } else {
            attempts.set(step.goalId, {
              successful: [],
              failing: [stepId]
            });
          }
        }
        break;
      default:
        throw new Unreachable(step)
    }
  })

  return {
    successful: success,
    attempts
  };
}
