/// Thin wrapper around `sentry_flutter` for apps reporting to a BugLenz instance.
library;

export 'src/init.dart' show initBugLenz, configureBugLenz, identify, clearIdentity, releaseOf;
export 'src/keys.dart' show isDenied, isIdentifier;
export 'src/scrub.dart' show scrubEvent, scrubBreadcrumb, scrubTransaction, scrubValue, filtered;
export 'src/text.dart' show maskText, maskEmails, stripUrl;
