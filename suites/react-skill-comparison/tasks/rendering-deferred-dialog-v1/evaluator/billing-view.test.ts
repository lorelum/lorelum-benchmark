import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface BillingDialog {
  render(): string;
}

interface BillingDialogFactory {
  create(): BillingDialog;
}

interface BillingView {
  render(isDialogOpen: boolean): { page: string; dialog?: string };
}

interface BillingViewModule {
  createBillingView(factory: BillingDialogFactory): BillingView;
}

const candidatePath =
  process.env.CANDIDATE_PATH ??
  "suites/react-skill-comparison/tasks/rendering-deferred-dialog-v1/starter/src/billing-view.ts";
const candidateUrl = `${pathToFileURL(resolve(candidatePath)).href}?run=${Date.now()}`;
const { createBillingView } = (await import(candidateUrl)) as BillingViewModule;

describe("rendering-deferred-dialog-v1", () => {
  test("does not create the dialog until an open render needs it", () => {
    let createCount = 0;
    const view = createBillingView({
      create() {
        createCount += 1;
        return { render: () => "Billing dialog" };
      },
    });

    expect(createCount).toBe(0);
    expect(view.render(false)).toEqual({ page: "Billing overview", dialog: undefined });
    expect(createCount).toBe(0);
    expect(view.render(true)).toEqual({
      page: "Billing overview",
      dialog: "Billing dialog",
    });
    expect(view.render(true)).toEqual({
      page: "Billing overview",
      dialog: "Billing dialog",
    });
    expect(createCount).toBe(1);
  });
});
