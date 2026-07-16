export interface DashboardApi {
  getUser(): Promise<{ id: string; name: string }>;
  getBilling(): Promise<{ plan: string; balanceCents: number }>;
  getFeatureFlags(): Promise<Record<string, boolean>>;
}

export interface DashboardData {
  user: { id: string; name: string };
  billing: { plan: string; balanceCents: number };
  featureFlags: Record<string, boolean>;
}

export async function loadDashboard(api: DashboardApi): Promise<DashboardData> {
  const user = await api.getUser();
  const billing = await api.getBilling();
  const featureFlags = await api.getFeatureFlags();

  return { user, billing, featureFlags };
}
