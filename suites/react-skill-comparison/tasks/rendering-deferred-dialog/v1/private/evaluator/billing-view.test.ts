import { describe, expect, test } from "bun:test";

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
  Bun.env.CANDIDATE_PATH ??
  "suites/react-skill-comparison/tasks/rendering-deferred-dialog/v1/public/starter/src/billing-view.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
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
