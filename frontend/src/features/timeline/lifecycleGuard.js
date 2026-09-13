import { isPlannedPageLeave, shouldIgnorePageLeaveError } from '@/utils/plannedPageLeave';

export const createTimelineLifecycleGuard = () => {
  const capture = (infra) => infra.timelineLifecycleGeneration;
  const isCurrent = (infra, generation) =>
    !infra.timelineDisposed && generation === infra.timelineLifecycleGeneration;
  const canApplyRequest = (infra, generation) => isCurrent(infra, generation) && !isPlannedPageLeave();
  const shouldIgnoreRequestError = (infra, error, generation) =>
    !canApplyRequest(infra, generation) || shouldIgnorePageLeaveError(error);
  const invalidate = (infra) => {
    infra.timelineDisposed = true;
    infra.timelineLifecycleGeneration += 1;
  };

  return {
    capture,
    isCurrent,
    canApplyRequest,
    shouldIgnoreRequestError,
    invalidate,
  };
};
