const absolutePathTokenPattern = /(^|[^A-Za-z0-9])([A-Za-z]:[\\/][^\s"'`]+|\\\\[^\s"'`]+|\/(?:[A-Za-z0-9._~-]+\/)+[^\s"'`]+)/g;

export const absolutePathPattern = /(?:^|[^A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\|\/(?:[A-Za-z0-9._~-]+\/)+)/i;

export function redactAbsolutePaths(text: string): string {
  return text.replace(absolutePathTokenPattern, "$1[redacted-path]");
}
