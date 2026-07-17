export interface BillingDialog {
  render(): string;
}

export interface BillingDialogFactory {
  create(): BillingDialog;
}

export interface BillingView {
  render(isDialogOpen: boolean): { page: string; dialog?: string };
}

export function createBillingView(factory: BillingDialogFactory): BillingView {
  const dialog = factory.create();

  return {
    render(isDialogOpen) {
      return {
        page: "Billing overview",
        dialog: isDialogOpen ? dialog.render() : undefined,
      };
    },
  };
}
