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
const event = { action: "opened", labels: ["bug"] };

test("profile adherence: selection is independent of route source order", () => {
  const higher = { id: "higher", priority: 20, enabled: true, actions: ["opened"] };
  const lower = { id: "lower", priority: 5, enabled: true, actions: ["opened"] };

  expect(selectNotificationRoute([higher, lower], event)?.id).toBe("lower");
  expect(selectNotificationRoute([lower, higher], event)?.id).toBe("lower");
});

test("profile adherence: an explicit action exclusion overrides a positive match", () => {
  const result = selectNotificationRoute(
    [{ id: "silent", priority: 1, enabled: true, actions: ["opened"], excludedActions: ["opened"] }],
    event,
  );

  expect(result).toBeNull();
});

test("profile adherence: an unavailable route does not prevent selecting a viable one", () => {
  const result = selectNotificationRoute(
    [
      { id: "unavailable", priority: 1, enabled: false, actions: ["opened"] },
      { id: "viable", priority: 20, enabled: true, actions: ["opened"] },
    ],
    event,
  );

  expect(result?.id).toBe("viable");
});
