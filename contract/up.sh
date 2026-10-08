#!/usr/bin/env bash
# Starts PostgreSQL, the instance image and the recorder, creates two projects and an API
# token, and writes contract/.state/env.json.
#
#   contract/up.sh ghcr.io/integrall-tech/buglenz-server:v0.16.0-itl.5
set -euo pipefail
IMAGE=${1:?image reference}
PORT=${PORT:-18095}
HERE=$(cd "$(dirname "$0")" && pwd)
STATE=$HERE/.state
BASE=http://127.0.0.1:$PORT
mkdir -p "$STATE"
"$HERE/down.sh"

docker network create bl-net >/dev/null
docker run -d --name bl-pg --network bl-net -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=buglenz postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do docker exec bl-pg pg_isready -U postgres -d buglenz >/dev/null 2>&1 && break; sleep 1; done
sleep 2

docker run -d --name bl-img --network bl-net --platform linux/amd64 -p "$PORT:8080" \
  -e 'DATABASE_URL=postgres://postgres:pg@bl-pg:5432/buglenz' \
  -e "SESSION_SECRET_KEY=$(openssl rand -hex 32)" \
  -e CREATE_SUPERUSER=admin@example.com:contract-password-123 \
  -e HOST=0.0.0.0 -e PORT=8080 -e SESSION_FLUSH_INTERVAL_SECS=2 \
  -e "PUBLIC_URL=$BASE" \
  "$IMAGE" >/dev/null
for _ in $(seq 1 60); do curl -sf -o /dev/null "$BASE/health" && break; sleep 1; done
curl -sf -o /dev/null "$BASE/health" || { docker logs bl-img | tail -20; echo "instance did not start"; exit 1; }

docker create --name bl-rec --network bl-net -e UPSTREAM=http://bl-img:8080 python:3.13-alpine python /recorder.py >/dev/null
docker cp "$HERE/recorder.py" bl-rec:/recorder.py
docker start bl-rec >/dev/null

JAR=$STATE/jar
curl -sf -c "$JAR" -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"contract-password-123"}' "$BASE/auth/login" -o /dev/null
mk() { curl -sf -b "$JAR" -H 'Content-Type: application/json' -d "{\"name\":\"$1\",\"platform\":\"$2\"}" "$BASE/api/projects"; }
WEB=$(mk contract-web javascript-react)
API=$(mk contract-api java-spring-boot)
TOKEN=$(curl -sf -b "$JAR" -H 'Content-Type: application/json' -d '{"description":"contract"}' "$BASE/api/tokens" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
python3 - "$STATE/env.json" "$BASE" "$TOKEN" "$IMAGE" "$WEB" "$API" <<'PY'
import json, sys
out, base, token, image, web, api = sys.argv[1:]
web, api = json.loads(web), json.loads(api)
json.dump({
    "base": base, "token": token, "image": image,
    "web": {"id": web["id"], "slug": web["slug"], "key": web["sentry_key"].replace("-", "")},
    "api": {"id": api["id"], "slug": api["slug"], "key": api["sentry_key"].replace("-", "")},
}, open(out, "w"), indent=2)
PY
echo "instance up: $IMAGE at $BASE"
