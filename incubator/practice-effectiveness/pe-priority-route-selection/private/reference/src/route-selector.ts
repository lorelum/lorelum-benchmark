export interface NotificationEvent {
  action: string;
  labels: string[];
}

export interface NotificationRoute {
  id: string;
  priority: number;
  enabled: boolean;
  actions?: string[];
  excludedActions?: string[];
  labels?: string[];
}

function matches(route: NotificationRoute, event: NotificationEvent): boolean {
  const actionMatches = !route.actions || route.actions.includes(event.action);
  const actionExcluded = route.excludedActions?.includes(event.action) ?? false;
  const labelsMatch = !route.labels || route.labels.every((label) => event.labels.includes(label));
  return route.enabled && actionMatches && !actionExcluded && labelsMatch;
}

export function selectNotificationRoute(routes: NotificationRoute[], event: NotificationEvent): NotificationRoute | null {
  return routes
    .filter((route) => matches(route, event))
    .sort((left, right) => left.priority - right.priority)[0] ?? null;
}
