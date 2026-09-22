const absolutePathTokenPattern = /(^|[^A-Za-z0-9])([A-Za-z]:[\\/][^\s"'`]+|\\\\[^\s"'`]+|\/(?:home|Users|workspace|workspaces|tmp|var|etc|opt|mnt|root|run|proc|dev|usr|bin|sbin|srv|app|private)\/[^\s"'`]+)/gi;

export const absolutePathPattern = /(?:^|[^A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\|\/(?:home|Users|workspace|workspaces|tmp|var|etc|opt|mnt|root|run|proc|dev|usr|bin|sbin|srv|app|private)\/)/i;

const credentialPatterns = [
  /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/i,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/i,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/i,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b(?:api[_ -]?key|access[_ -]?token|authorization|password|secret|credential)\s*[:=]\s*(?:bearer\s+)?[^\s"'`]{8,}/i,
];

export function containsSensitiveCredential(text: string): boolean {
  return credentialPatterns.some((pattern) => pattern.test(text));
}

export function redactSensitiveCredentials(text: string): string {
  return credentialPatterns.reduce((result, pattern) => result.replace(pattern, "[redacted-credential]"), text);
}

export function redactAbsolutePaths(text: string): string {
  return text.replace(absolutePathTokenPattern, "$1[redacted-path]");
}
