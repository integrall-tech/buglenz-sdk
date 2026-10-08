const APP_NAME = /^[a-z0-9][a-z0-9._-]*$/;

/** `<app>@<version>`, validated: the format every instance and dashboard relies on. */
export function releaseOf(app: string, version: string): string {
  if (!APP_NAME.test(app)) throw new Error(`BugLenz: "app" must be lowercase letters, digits, ".", "_" or "-" (got "${app}")`);
  if (!version || /[@\s]/.test(version)) throw new Error('BugLenz: "version" is required and cannot contain "@" or spaces');
  return `${app}@${version}`;
}
