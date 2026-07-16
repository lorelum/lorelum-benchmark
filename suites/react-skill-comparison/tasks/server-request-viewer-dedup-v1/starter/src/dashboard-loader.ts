export interface Viewer {
  id: string;
  name: string;
}

export interface DashboardApi {
  getViewer(): Promise<Viewer>;
  getNavigation(viewerId: string): Promise<string[]>;
}

export interface DashboardData {
  header: { viewerName: string };
  navigation: string[];
}

export function createDashboardLoader(api: DashboardApi) {
  return async function loadDashboard(): Promise<DashboardData> {
    const header = api.getViewer().then((viewer) => ({ viewerName: viewer.name }));
    const navigation = api
      .getViewer()
      .then((viewer) => api.getNavigation(viewer.id));

    const [resolvedHeader, resolvedNavigation] = await Promise.all([
      header,
      navigation,
    ]);

    return { header: resolvedHeader, navigation: resolvedNavigation };
  };
}
