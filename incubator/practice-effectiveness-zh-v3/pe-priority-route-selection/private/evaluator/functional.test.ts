import { expect, test } from "bun:test";

type NotificationEvent = { action: string; labels: string[] };
type NotificationRoute = {
  id: string;
  priority: number;
  enabled: boolean;
  actions?: string[];
  excludedActions?: string[];
  labels?: string[];
};
type RouteSelectorModule = {
  selectNotificationRoute(routes: NotificationRoute[], event: NotificationEvent): NotificationRoute | null;
};

const candidatePath = Bun.env.CANDIDATE_PATH
  ?? "incubator/practice-effectiveness/pe-priority-route-selection/public/starter/src/route-selector.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { selectNotificationRoute } = (await import(candidateUrl)) as RouteSelectorModule;

test("functional: unmatched local events return no route", () => {
  const result = selectNotificationRoute(
    [{ id: "docs", priority: 10, enabled: true, actions: ["opened"], labels: ["documentation"] }],
    { action: "closed", labels: ["bug"] },
  );

  expect(result).toBeNull();
});

test("functional: matching local events return a usable route", () => {
  const result = selectNotificationRoute(
    [{ id: "bugs", priority: 10, enabled: true, actions: ["opened"], labels: ["bug"] }],
    { action: "opened", labels: ["bug", "urgent"] },
  );

  expect(result?.id).toBe("bugs");
});
