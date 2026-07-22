export interface ReleaseDescriptor {
  name: string;
  version: string;
  dependsOn?: string[];
}

export interface ReleaseCheck {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function checkReleaseDescriptor(descriptor: ReleaseDescriptor): ReleaseCheck {
  const errors: string[] = [];
  if (!descriptor.name) errors.push("name is required");
  if (!descriptor.version) errors.push("version is required");
  if (descriptor.dependsOn && descriptor.dependsOn.length > 0) errors.push("dependencies are not supported");

  return { valid: errors.length === 0, errors, warnings: [] };
}
