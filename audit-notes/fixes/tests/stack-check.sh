#!/bin/bash
# ── NEW ── test helper only, not copied into src/
# Checks sign-in and roles through nginx on a running stack that uses stub_ums.py.
# Usage: bash stack-check.sh [http://localhost:8099]
B=${1:-http://localhost:8099}
J=$(mktemp -d)
pass=0; fail=0
check() {  # name expected actual
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "ok   $1 ($3)"; else fail=$((fail+1)); echo "FAIL $1: expected $2, got $3"; fi
}
link() { python3 -c "import base64,json,sys,urllib.parse as u; print(base64.b64encode(u.quote(json.dumps({'username':sys.argv[1],'systemReferenceCode':'SYS-222-FM'}),safe='').encode()).decode())" "$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
login() {  # user -> cookie jar $J/<user>
  code -c "$J/$1" -H 'Content-Type: application/json' -d "{\"credentials\":\"$(link "$1")\"}" "$B/api/auth/login"
}

echo "== not signed in"
check "home page" 200 "$(code "$B/")"
check "portal link path serves the app" 200 "$(code "$B/authenticate/$(link owner)")"
check "diagrams" 401 "$(code "$B/api/diagrams")"
check "templates" 401 "$(code "$B/api/templates")"
check "erd documents" 401 "$(code "$B/api/erd/documents")"
check "erd introspect" 401 "$(code -X POST -H 'Content-Type: application/json' -d '{}' "$B/api/erd/introspect")"
check "erd 401 is JSON" '{"detail":"Not signed in. Open Flowmira from the IPC portal."}' "$(curl -s "$B/api/erd/documents")"

echo "== sign in"
for u in owner super regular admin; do check "login $u" 200 "$(login $u)"; done
check "login atlas_owner (other system only)" 403 "$(login atlas_owner)"
check "login unknown user" 403 "$(login nobody)"
check "cookie is HttpOnly" 1 "$(grep -c '#HttpOnly_' "$J/owner")"

echo "== system owner / super user: everything"
for u in owner super; do
  check "$u diagrams" 200 "$(code -b "$J/$u" "$B/api/diagrams")"
  check "$u erd documents" 200 "$(code -b "$J/$u" "$B/api/erd/documents")"
  check "$u erd engines" 200 "$(code -b "$J/$u" "$B/api/erd/engines")"
done

echo "== regular user / administrator: diagrams only"
for u in regular admin; do
  check "$u templates" 200 "$(code -b "$J/$u" "$B/api/templates")"
  check "$u diagrams" 200 "$(code -b "$J/$u" "$B/api/diagrams")"
  check "$u erd documents" 403 "$(code -b "$J/$u" "$B/api/erd/documents")"
  check "$u erd create" 403 "$(code -b "$J/$u" -X POST -H 'Content-Type: application/json' -d '{"title":"x","dbml":"Table a { id int }"}' "$B/api/erd/documents")"
  check "$u erd introspect" 403 "$(code -b "$J/$u" -X POST -H 'Content-Type: application/json' -d '{}' "$B/api/erd/introspect")"
done
check "erd 403 is JSON" '{"detail":"Database diagrams (ERD) are for Flowmira system owners only."}' "$(curl -s -b "$J/regular" "$B/api/erd/documents")"
check "auth check route isn't a way around it" 403 "$(code -b "$J/regular" "$B/api/auth/check?role=owner")"
check "internal location is not public" 404 "$(code -b "$J/owner" "$B/_auth/owner")"

echo "== ownership"
id=$(curl -s -b "$J/regular" -H 'Content-Type: application/json' -d '{"title":"Regular one","template_key":"sipoc"}' "$B/api/diagrams" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
check "admin can't open regular's diagram" 404 "$(code -b "$J/admin" "$B/api/diagrams/$id")"
check "owner can open regular's diagram" 200 "$(code -b "$J/owner" "$B/api/diagrams/$id")"
check "owner list shows the creator" 1 "$(curl -s -b "$J/owner" "$B/api/diagrams" | grep -c '"owner_name":"Regular User"')"
check "regular can't import (dates)" 403 "$(code -b "$J/regular" -H 'Content-Type: application/json' -d '{"title":"i","template_key":"sipoc","created_at":"2020-01-01T00:00:00Z"}' "$B/api/diagrams")"

if [ "${VIEW_CHECKS:-0}" = 1 ]; then
  echo "== access read from ipc_centralized.user_system_active_accesses_vw"
  check "inactive in the view → refused (UMS says System Owner)" 403 "$(login inactive)"
  check "promoted sign-in" 200 "$(login promoted)"
  check "promoted is owner (view says System Owner, UMS says Regular)" 200 "$(code -b "$J/promoted" "$B/api/erd/documents")"
fi

echo "== sign out"
check "logout" 204 "$(code -b "$J/regular" -c "$J/regular" -X POST "$B/api/auth/logout")"
check "after logout" 401 "$(code -b "$J/regular" "$B/api/diagrams")"

rm -rf "$J"
echo "passed $pass, failed $fail"
[ "$fail" = 0 ]
