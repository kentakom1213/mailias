import { expect, it } from "vitest";
import { nextSetupStep, visibleSetupStep, type SetupProgress } from "../src/extension/setup-navigation";

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
