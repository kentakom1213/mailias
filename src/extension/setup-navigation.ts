export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type SetupProgress = {
  workerOrigin?: string;
  domain?: string;
  configured: boolean;
  setupLocked: boolean;
  recoveryBackedUp?: boolean;
  emailRoutingConfirmed?: boolean;
};

export function nextSetupStep(status: SetupProgress, hasDraftKey: boolean, workerReady: boolean): WizardStep {
  if (!status.workerOrigin) return 1;
  if (!status.domain) return 2;
  if (!status.configured && !hasDraftKey) return 3;
  if (!status.recoveryBackedUp) return 4;
  if (!workerReady) return 5;
  if (!status.emailRoutingConfirmed) return 6;
  return 7;
}

// Reviewing a completed step must not change saved setup data or bypass a prerequisite.
export function visibleSetupStep(requested: WizardStep | null, available: WizardStep): WizardStep {
  return requested === null || requested > available ? available : requested;
}

// Saved key/domain steps are locked; a draft key is kept when returning to the domain.
export function previousSetupStep(step: WizardStep, locked: boolean, hasDraftKey: boolean): WizardStep {
  let previous = Math.max(1, step - 1);
  if (locked && previous >= 2 && previous <= 4) previous = 1;
  if (!locked && hasDraftKey && previous === 3) previous = 2;
  return previous as WizardStep;
}
