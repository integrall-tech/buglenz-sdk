#!/usr/bin/env bash
# Contract run: the wrappers against a published instance image.
#
#   contract/run.sh ghcr.io/integrall-tech/buglenz-server:v0.16.0-itl.5 [react|spring|flutter|all]
#
# KEEP=1 leaves the containers up for inspection.
set -euo pipefail
IMAGE=${1:?image reference}
WHICH=${2:-all}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
STATE=$HERE/.state
cleanup() { [ "${KEEP:-0}" = 1 ] || "$HERE/down.sh"; }
trap cleanup EXIT

"$HERE/up.sh" "$IMAGE"
json() { python3 -c "import json,sys; print(json.load(open('$STATE/env.json'))$1)"; }
RESULT=""

run_react() {
  echo "== react"
  ( cd "$ROOT/react" && npm install --no-audit --no-fund >/dev/null && npm run build >/dev/null && npm pack --pack-destination "$STATE" >/dev/null )
  local app=$HERE/react-app
  rm -rf "$app/node_modules" "$app/dist"
  export VITE_BUGLENZ_DSN="http://$(json "['web']['key']")@127.0.0.1:18095/$(json "['web']['id']")"
  export SENTRY_URL="$(json "['base']")" SENTRY_AUTH_TOKEN="$(json "['token']")" SENTRY_PROJECT="$(json "['web']['slug']")"
  ( cd "$app" && npm install --no-audit --no-fund >/dev/null && npm install --no-audit --no-fund "$STATE"/integrall-buglenz-react-*.tgz >/dev/null \
    && npm run build && npx playwright install ${PLAYWRIGHT_DEPS:+--with-deps} chromium >/dev/null )
  ( cd "$app" && { npm run preview >"$STATE/preview.log" 2>&1 & echo $! > "$STATE/preview.pid"; } \
    && for _ in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:4273/ && break; sleep 1; done \
    && node run.mjs http://127.0.0.1:4273 "$STATE/react-envelopes.jsonl" ) || { kill "$(cat "$STATE/preview.pid")" 2>/dev/null; return 1; }
  kill "$(cat "$STATE/preview.pid")" 2>/dev/null || true
  node "$HERE/assert.mjs" react
}

run_spring() {
  echo "== spring"
  docker rm -f bl-build >/dev/null 2>&1 || true
  docker run -d --name bl-build --network bl-net maven:3.9-eclipse-temurin-21-alpine sleep 3600 >/dev/null
  docker cp "$ROOT/spring-boot" bl-build:/w-starter
  docker cp "$ROOT/shared" bl-build:/shared
  docker cp "$HERE/spring-app" bl-build:/w-app
  docker exec -w /w-starter bl-build mvn -B -q install -DskipTests
  docker exec -w /w-app bl-build mvn -B -q package -DskipTests
  docker exec -e "BUGLENZ_DSN=http://$(json "['api']['key']")@bl-rec:8091/$(json "['api']['id']")" bl-build \
    java -jar /w-app/target/buglenz-contract-spring-1.0.0.jar >/dev/null 2>&1 || true
  sleep 3
  docker cp bl-rec:/rec/traffic.jsonl "$STATE/spring-traffic.jsonl"
  node "$HERE/assert.mjs" spring
}

run_flutter() {
  echo "== flutter"
  ( cd "$HERE/flutter-app" && flutter pub get >/dev/null \
    && BUGLENZ_DSN="http://$(json "['mobile']['key']")@127.0.0.1:${REC_PORT:-18096}/$(json "['mobile']['id']")" flutter test test/contract_test.dart )
  sleep 3
  docker cp bl-rec:/rec/traffic.jsonl "$STATE/flutter-traffic.jsonl"
  node "$HERE/assert.mjs" flutter
}

case "$WHICH" in
  react) run_react ;;
  spring) run_spring ;;
  flutter) run_flutter ;;
  all) run_react; run_spring; run_flutter ;;
  *) echo "usage: run.sh <image> [react|spring|flutter|all]"; exit 2 ;;
esac
