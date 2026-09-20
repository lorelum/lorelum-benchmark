const absolutePathTokenPattern = /(^|[^A-Za-z0-9])([A-Za-z]:[\\/][^\s"'`]+|\\\\[^\s"'`]+|\/(?:home|Users|workspace|workspaces|tmp|var|etc|opt|mnt|root|run|proc|dev|usr|bin|sbin|srv|app|private)\/[^\s"'`]+)/gi;

export const absolutePathPattern = /(?:^|[^A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\|\/(?:home|Users|workspace|workspaces|tmp|var|etc|opt|mnt|root|run|proc|dev|usr|bin|sbin|srv|app|private)\/)/i;

export function redactAbsolutePaths(text: string): string {
  return text.replace(absolutePathTokenPattern, "$1[redacted-path]");
}
