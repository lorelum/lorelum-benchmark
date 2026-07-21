import { describe, expect, test } from "bun:test";

interface MemberProfile {
  id: string;
  displayName: string;
}

interface Organisation {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
}

interface PendingReview {
  id: string;
  projectId: string;
}

interface ActivityRecord {
  id: string;
  projectId: string;
  action: string;
}

interface MemberHubApi {
  getMemberProfile(memberId: string): Promise<MemberProfile>;
  getOrganisationForMember(memberId: string): Promise<Organisation>;
  getProjects(organisationId: string): Promise<Project[]>;
  getPendingReviews(organisationId: string): Promise<PendingReview[]>;
  getActivity(projectIds: string[]): Promise<ActivityRecord[]>;
}

interface MemberHub {
  profile: MemberProfile;
  organisation: Organisation;
  projects: Project[];
  pendingReviews: PendingReview[];
  activity: ActivityRecord[] | null;
}

interface MemberHubModule {
  loadMemberHub(api: MemberHubApi, input: { memberId: string; includeActivity: boolean }): Promise<MemberHub | null>;
}

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const candidatePath = Bun.env.CANDIDATE_PATH ?? "suites/react-skill-comparison/tasks/member-hub-loader/v1/public/starter/src/member-hub.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { loadMemberHub } = (await import(candidateUrl)) as MemberHubModule;

describe("member-hub-loader-v1", () => {
  test("avoids all I/O for a blank member identifier", async () => {
    let calls = 0;
    const api: MemberHubApi = {
      async getMemberProfile() { calls += 1; throw new Error("unexpected"); },
      async getOrganisationForMember() { calls += 1; throw new Error("unexpected"); },
      async getProjects() { calls += 1; throw new Error("unexpected"); },
      async getPendingReviews() { calls += 1; throw new Error("unexpected"); },
      async getActivity() { calls += 1; throw new Error("unexpected"); },
    };

    await expect(loadMemberHub(api, { memberId: "  ", includeActivity: true })).resolves.toBeNull();
    expect(calls).toBe(0);
  });

  test("starts eligible reads without serialising the dependency graph", async () => {
    const calls: string[] = [];
    const profile = deferred<MemberProfile>();
    const organisation = deferred<Organisation>();
    const projects = deferred<Project[]>();
    const pendingReviews = deferred<PendingReview[]>();
    const activity = deferred<ActivityRecord[]>();
    const api: MemberHubApi = {
      getMemberProfile(memberId) { calls.push(`profile:${memberId}`); return profile.promise; },
      getOrganisationForMember(memberId) { calls.push(`organisation:${memberId}`); return organisation.promise; },
      getProjects(organisationId) { calls.push(`projects:${organisationId}`); return projects.promise; },
      getPendingReviews(organisationId) { calls.push(`reviews:${organisationId}`); return pendingReviews.promise; },
      getActivity(projectIds) { calls.push(`activity:${projectIds.join(",")}`); return activity.promise; },
    };

    const hub = loadMemberHub(api, { memberId: "mira", includeActivity: true });
    expect(calls).toEqual(["profile:mira", "organisation:mira"]);

    organisation.resolve({ id: "org-1", name: "Northstar" });
    await flushMicrotasks();
    expect(calls).toEqual(["profile:mira", "organisation:mira", "projects:org-1", "reviews:org-1"]);

    projects.resolve([{ id: "project-1", name: "Console" }]);
    await flushMicrotasks();
    expect(calls).toEqual(["profile:mira", "organisation:mira", "projects:org-1", "reviews:org-1", "activity:project-1"]);

    profile.resolve({ id: "mira", displayName: "Mira" });
    pendingReviews.resolve([{ id: "review-1", projectId: "project-1" }]);
    activity.resolve([{ id: "activity-1", projectId: "project-1", action: "opened" }]);

    await expect(hub).resolves.toEqual({
      profile: { id: "mira", displayName: "Mira" },
      organisation: { id: "org-1", name: "Northstar" },
      projects: [{ id: "project-1", name: "Console" }],
      pendingReviews: [{ id: "review-1", projectId: "project-1" }],
      activity: [{ id: "activity-1", projectId: "project-1", action: "opened" }],
    });
  });

  test("skips activity when the caller does not request it", async () => {
    let activityCalls = 0;
    const api: MemberHubApi = {
      async getMemberProfile() { return { id: "mira", displayName: "Mira" }; },
      async getOrganisationForMember() { return { id: "org-1", name: "Northstar" }; },
      async getProjects() { return [{ id: "project-1", name: "Console" }]; },
      async getPendingReviews() { return []; },
      async getActivity() { activityCalls += 1; return []; },
    };

    await expect(loadMemberHub(api, { memberId: "mira", includeActivity: false })).resolves.toEqual({
      profile: { id: "mira", displayName: "Mira" },
      organisation: { id: "org-1", name: "Northstar" },
      projects: [{ id: "project-1", name: "Console" }],
      pendingReviews: [],
      activity: null,
    });
    expect(activityCalls).toBe(0);
  });

  test("does not start activity when the project read rejects", async () => {
    const expected = new Error("projects unavailable");
    let activityCalls = 0;
    const api: MemberHubApi = {
      async getMemberProfile() { return { id: "mira", displayName: "Mira" }; },
      async getOrganisationForMember() { return { id: "org-1", name: "Northstar" }; },
      async getProjects() { throw expected; },
      async getPendingReviews() { return []; },
      async getActivity() { activityCalls += 1; return []; },
    };

    await expect(loadMemberHub(api, { memberId: "mira", includeActivity: true })).rejects.toBe(expected);
    expect(activityCalls).toBe(0);
  });
});
