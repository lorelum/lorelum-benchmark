import { joinPath, listDirectories, workspaceRoot } from "./fs";

export type TaskLocation = {
  suite: string;
  reference: string;
  path: string;
};

export async function discoverTasks(): Promise<TaskLocation[]> {
  const tasks: TaskLocation[] = [];
  const suitesPath = joinPath(workspaceRoot, "suites");
  for (const suite of await listDirectories(suitesPath)) {
    const tasksPath = joinPath(suitesPath, suite, "tasks");
    for (const slug of await listDirectories(tasksPath)) {
      for (const revision of await listDirectories(joinPath(tasksPath, slug))) {
        if (/^v[1-9][0-9]*$/.test(revision)) {
          tasks.push({ suite, reference: `${slug}/${revision}`, path: joinPath(tasksPath, slug, revision) });
        }
      }
    }
  }
  return tasks.sort((left, right) => `${left.suite}/${left.reference}`.localeCompare(`${right.suite}/${right.reference}`));
}

export async function findTask(suite: string, reference: string): Promise<TaskLocation | undefined> {
  return (await discoverTasks()).find((task) => task.suite === suite && task.reference === reference);
}
