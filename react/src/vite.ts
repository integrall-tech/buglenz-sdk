import { sentryVitePlugin } from '@sentry/vite-plugin';
import { releaseOf } from './init';

export interface SourceMapOptions {
  /** Base URL of the instance, for example `https://errors.buglenz.dev`. */
  url: string;
  /** API token of the instance (secret: keep it in the CI vault). */
  authToken: string;
  /** Slug of the project in the instance. */
  project: string;
  app: string;
  version: string;
  /** Where the build writes the maps; they are deleted after the upload. Default `./dist/**\/*.map`. */
  mapsGlob?: string;
}

/**
 * Vite plugin that uploads source maps to the instance only: the plugin's own
 * telemetry is off, the organisation slug is a placeholder the instance ignores,
 * and the maps are removed from the build afterwards. Requires `build.sourcemap: true`.
 */
export function brandSourceMaps(options: SourceMapOptions): ReturnType<typeof sentryVitePlugin> {
  if (!options.url || !options.authToken || !options.project) {
    throw new Error('BugLenz: brandSourceMaps needs url, authToken and project');
  }
  return sentryVitePlugin({
    url: options.url,
    authToken: options.authToken,
    org: 'buglenz',
    project: options.project,
    release: { name: releaseOf(options.app, options.version) },
    telemetry: false,
    sourcemaps: { filesToDeleteAfterUpload: [options.mapsGlob ?? './dist/**/*.map'] },
  });
}
