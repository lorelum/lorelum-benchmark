import { compatibilityChecks } from "./compatibility";
import { lifecycleChecks } from "./lifecycle";
import type { CheckDefinition } from "./types";

export const checks: CheckDefinition[] = [...lifecycleChecks, ...compatibilityChecks];
