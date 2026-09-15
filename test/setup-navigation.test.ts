import { expect, it } from "vitest";
import { nextSetupStep, previousSetupStep, visibleSetupStep, type SetupProgress } from "../src/extension/setup-navigation";

const draft: SetupProgress = {
  workerOrigin: "https://worker.example.com", domain: "m.example.com",
  configured: false, setupLocked: false,
};

it("allows reviewing earlier steps while retaining the generated draft key", () => {
  const available = nextSetupStep(draft, true, false);
  expect(available).toBe(4);
  expect(visibleSetupStep(3, available)).toBe(3);
  expect(visibleSetupStep(2, available)).toBe(2);
  expect(visibleSetupStep(4, nextSetupStep(draft, true, false))).toBe(4);
});

it("returns to the missing prerequisite after undo or a lost draft", () => {
  expect(visibleSetupStep(4, nextSetupStep(draft, false, false))).toBe(3);
  expect(visibleSetupStep(4, nextSetupStep({ ...draft, domain: "" }, true, false))).toBe(2);
  expect(visibleSetupStep(4, nextSetupStep({ ...draft, workerOrigin: "" }, true, false))).toBe(1);
});

it("allows reviewing saved key steps but does not skip the Worker check", () => {
  const saved = { ...draft, configured: true, setupLocked: true, recoveryBackedUp: true, emailRoutingConfirmed: true };
  expect(visibleSetupStep(3, nextSetupStep(saved, false, false))).toBe(3);
  expect(visibleSetupStep(7, nextSetupStep(saved, false, false))).toBe(5);
  expect(visibleSetupStep(null, nextSetupStep(saved, false, true))).toBe(7);
});

it("returns to editable steps without requiring an extra next button", () => {
  expect(previousSetupStep(4, false, true)).toBe(2);
  expect(previousSetupStep(5, true, false)).toBe(1);
  expect(previousSetupStep(6, true, false)).toBe(5);
  expect(previousSetupStep(7, true, false)).toBe(6);
  expect(previousSetupStep(3, false, false)).toBe(2);
});
