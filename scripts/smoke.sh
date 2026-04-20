#!/usr/bin/env bash
# =============================================================================
# smoke.sh — end-to-end verification of the andmore-qr-codes deployment.
#
# Exercises every deployed API route, hits the public CloudFront redirects, and
# prints a single green checkmark per route. Bails on the first failure.
#
# Required environment variables:
#   API_URL          — the authenticated API Gateway URL (from the
#                      CloudFormation "ApiUrl" output). Example:
#                          https://abc123.execute-api.us-east-1.amazonaws.com/Prod
#   PUBLIC_BASE_URL  — the user-facing CloudFront/custom domain used for public
#                      routes like /r/{qrId}, /l/{clickId}, /public/pages/{slug}.
#                      Example: https://qr.example.com
#   ID_TOKEN         — a Cognito ID token for a test user.
#
# How to fetch an ID_TOKEN from Cognito:
#   1. Look up the CloudFormation outputs CognitoUserPoolId and
#      CognitoUserPoolClientId:
#        aws cloudformation describe-stacks \
#          --stack-name andmore-qr-codes \
#          --query 'Stacks[0].Outputs' --output table
#
#   2. Create (once) a confirmed test user:
#        aws cognito-idp admin-create-user \
#          --user-pool-id "$USER_POOL_ID" \
#          --username smoke@example.com \
#          --temporary-password 'Temp-Passw0rd!' \
#          --message-action SUPPRESS
#        aws cognito-idp admin-set-user-password \
#          --user-pool-id "$USER_POOL_ID" \
#          --username smoke@example.com \
#          --password 'Smoke-Passw0rd!' \
#          --permanent
#
#   3. Fetch an ID token via USER_PASSWORD_AUTH:
#        ID_TOKEN=$(aws cognito-idp initiate-auth \
#          --auth-flow USER_PASSWORD_AUTH \
#          --client-id "$USER_POOL_CLIENT_ID" \
#          --auth-parameters USERNAME=smoke@example.com,PASSWORD='Smoke-Passw0rd!' \
#          --query 'AuthenticationResult.IdToken' --output text)
#
#   4. Run the script:
#        API_URL="https://..." PUBLIC_BASE_URL="https://qr.example.com" \
#        ID_TOKEN="$ID_TOKEN" bash scripts/smoke.sh
#
# Dependencies: curl, jq.
# =============================================================================

set -euo pipefail

: "${API_URL:?API_URL is required}"
: "${PUBLIC_BASE_URL:?PUBLIC_BASE_URL is required}"
: "${ID_TOKEN:?ID_TOKEN is required}"

GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

# Strip any trailing slashes so concatenation is predictable.
API_URL="${API_URL%/}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"

PASS_COUNT=0
FAIL_COUNT=0
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# -------- helpers -----------------------------------------------------------

# auth_request METHOD PATH [JSON_BODY] [EXTRA_CURL_ARGS...]
# Captures the response body in $TMP_DIR/body.json and echoes the HTTP status
# code on stdout.
auth_request() {
  local method="$1" path="$2" body="${3-}"
  shift 3 2>/dev/null || shift "$#"

  local url="${API_URL}${path}"
  local args=(
    -sS
    -o "$TMP_DIR/body.json"
    -w "%{http_code}"
    -X "$method"
    -H "Authorization: Bearer $ID_TOKEN"
    -H "Content-Type: application/json"
  )
  if [[ -n "$body" ]]; then
    args+=(-d "$body")
  fi
  curl "${args[@]}" "$url"
}

# public_request METHOD PATH [EXTRA_CURL_ARGS...]
# Same contract as auth_request but without the Authorization header and
# against PUBLIC_BASE_URL. Follows no redirects so we can inspect 302s.
public_request() {
  local method="$1" path="$2"
  local url="${PUBLIC_BASE_URL}${path}"
  curl -sS \
    -o "$TMP_DIR/body.json" \
    -w "%{http_code}" \
    -X "$method" \
    "$url"
}

# expect STATUS ACTUAL LABEL
# Increments counters, prints the result line, and returns nonzero on mismatch.
expect() {
  local expected="$1" actual="$2" label="$3"
  if [[ "$actual" == "$expected" ]]; then
    printf "  ${GREEN}✓${RESET} %s ${BOLD}(%s)${RESET}\n" "$label" "$actual"
    PASS_COUNT=$((PASS_COUNT + 1))
    return 0
  fi
  printf "  ${RED}✗${RESET} %s ${BOLD}(expected %s, got %s)${RESET}\n" "$label" "$expected" "$actual"
  if [[ -f "$TMP_DIR/body.json" ]]; then
    echo "    body: $(cat "$TMP_DIR/body.json" | head -c 400)"
  fi
  FAIL_COUNT=$((FAIL_COUNT + 1))
  exit 1
}

# expect_any OK_CODES ACTUAL LABEL
# Same contract as `expect`, but passes when ACTUAL is one of OK_CODES
# (space-separated).
expect_any() {
  local expected_list="$1" actual="$2" label="$3"
  for code in $expected_list; do
    if [[ "$actual" == "$code" ]]; then
      printf "  ${GREEN}✓${RESET} %s ${BOLD}(%s)${RESET}\n" "$label" "$actual"
      PASS_COUNT=$((PASS_COUNT + 1))
      return 0
    fi
  done
  printf "  ${RED}✗${RESET} %s ${BOLD}(expected one of [%s], got %s)${RESET}\n" "$label" "$expected_list" "$actual"
  if [[ -f "$TMP_DIR/body.json" ]]; then
    echo "    body: $(cat "$TMP_DIR/body.json" | head -c 400)"
  fi
  FAIL_COUNT=$((FAIL_COUNT + 1))
  exit 1
}

# base64url encoder for constructing /l/{clickId}.
b64url() {
  # `base64` on BSD and GNU both support basic encoding; translate to URL-safe.
  printf '%s' "$1" | base64 | tr '+/' '-_' | tr -d '='
}

echo "${BOLD}andmore-qr-codes smoke${RESET}"
echo "  API_URL=$API_URL"
echo "  PUBLIC_BASE_URL=$PUBLIC_BASE_URL"
echo

# -------- authenticated routes ---------------------------------------------

echo "${BOLD}Authenticated QR routes${RESET}"

status=$(auth_request GET "/qrs")
expect "200" "$status" "GET /qrs"

status=$(auth_request POST "/qrs" '{"name":"smoke-test","type":"direct","destinationUrl":"https://example.com"}')
expect "201" "$status" "POST /qrs (direct)"
QR_ID=$(jq -r '.qrId' < "$TMP_DIR/body.json")
if [[ -z "$QR_ID" || "$QR_ID" == "null" ]]; then
  echo "  ${RED}✗${RESET} could not parse qrId from POST /qrs response"
  exit 1
fi
echo "    captured qrId=$QR_ID"

status=$(auth_request GET "/qrs/$QR_ID")
expect "200" "$status" "GET /qrs/{qrId}"

status=$(auth_request PATCH "/qrs/$QR_ID" '{"name":"smoke-test renamed"}')
expect "200" "$status" "PATCH /qrs/{qrId} (rename)"
current_version=$(jq -r '.currentVersion' < "$TMP_DIR/body.json")
if [[ "$current_version" != "2" ]]; then
  echo "  ${RED}✗${RESET} currentVersion did not bump to 2 after rename (got $current_version)"
  exit 1
fi
echo "    currentVersion bumped to $current_version"

status=$(auth_request GET "/qrs/$QR_ID/versions")
expect "200" "$status" "GET /qrs/{qrId}/versions"
version_count=$(jq '. | length' < "$TMP_DIR/body.json")
if [[ "$version_count" -lt 2 ]]; then
  echo "  ${RED}✗${RESET} expected >=2 versions, got $version_count"
  exit 1
fi
echo "    versions returned: $version_count"

status=$(auth_request POST "/qrs/$QR_ID/versions/1/restore" '{}')
expect "200" "$status" "POST /qrs/{qrId}/versions/1/restore"

# -------- page routes -------------------------------------------------------

echo
echo "${BOLD}Authenticated Page routes${RESET}"

SLUG="smoke-$(date +%s)-$RANDOM"
status=$(auth_request POST "/pages" "{\"slug\":\"$SLUG\",\"displayName\":\"Smoke User\"}")
expect "201" "$status" "POST /pages"
PAGE_ID=$(jq -r '.pageId' < "$TMP_DIR/body.json")
CREATED_SLUG=$(jq -r '.slug' < "$TMP_DIR/body.json")
if [[ -z "$PAGE_ID" || "$PAGE_ID" == "null" ]]; then
  echo "  ${RED}✗${RESET} could not parse pageId from POST /pages"
  exit 1
fi
echo "    captured pageId=$PAGE_ID slug=$CREATED_SLUG"

status=$(auth_request GET "/pages/$PAGE_ID")
expect "200" "$status" "GET /pages/{pageId}"

LINK_BODY=$(cat <<EOF
{
  "links": [
    {"kind":"custom","label":"Smoke Link","url":"https://example.com/smoke","icon":"link"}
  ]
}
EOF
)
status=$(auth_request PATCH "/pages/$PAGE_ID" "$LINK_BODY")
expect "200" "$status" "PATCH /pages/{pageId} (add link)"
LINK_KEY=$(jq -r '.links[0].linkKey' < "$TMP_DIR/body.json")
if [[ -z "$LINK_KEY" || "$LINK_KEY" == "null" ]]; then
  echo "  ${RED}✗${RESET} could not parse linkKey after PATCH"
  exit 1
fi
echo "    captured linkKey=$LINK_KEY"

status=$(auth_request POST "/pages/$PAGE_ID/publish" '{}')
expect "200" "$status" "POST /pages/{pageId}/publish"

status=$(auth_request GET "/pages/$PAGE_ID/versions")
expect "200" "$status" "GET /pages/{pageId}/versions"
page_version_count=$(jq '. | length' < "$TMP_DIR/body.json")
if [[ "$page_version_count" -lt 2 ]]; then
  echo "  ${RED}✗${RESET} expected >=2 page versions, got $page_version_count"
  exit 1
fi
echo "    versions returned: $page_version_count"

# -------- public routes (must run while the page is published) -------------

echo
echo "${BOLD}Public routes${RESET}"

status=$(public_request GET "/public/pages/$CREATED_SLUG")
expect "200" "$status" "GET /public/pages/{slug}"

status=$(public_request GET "/r/$QR_ID")
expect "302" "$status" "GET /r/{qrId}"

CLICK_ID=$(b64url "$CREATED_SLUG:$LINK_KEY")
status=$(public_request GET "/l/$CLICK_ID")
expect "302" "$status" "GET /l/{clickId}"

# -------- analytics (before cleanup) ---------------------------------------

echo
echo "${BOLD}Analytics${RESET}"

status=$(auth_request GET "/analytics/summary")
expect "200" "$status" "GET /analytics/summary"

status=$(auth_request GET "/analytics/qrs/$QR_ID")
expect "200" "$status" "GET /analytics/qrs/{qrId}"

# -------- cleanup -----------------------------------------------------------

echo
echo "${BOLD}Cleanup${RESET}"

status=$(auth_request DELETE "/qrs/$QR_ID")
expect "204" "$status" "DELETE /qrs/{qrId}"

status=$(auth_request DELETE "/pages/$PAGE_ID")
expect "204" "$status" "DELETE /pages/{pageId}"

# Re-check analytics for the deleted QR — 404 is acceptable because the QR
# was removed. Accept either code to keep the smoke deterministic.
status=$(auth_request GET "/analytics/qrs/$QR_ID")
expect_any "200 404" "$status" "GET /analytics/qrs/{qrId} (after delete — either 200 or 404)"

# -------- summary -----------------------------------------------------------

echo
echo "${BOLD}Summary${RESET}"
printf "  ${GREEN}%s passed${RESET}, ${RED}%s failed${RESET}\n" "$PASS_COUNT" "$FAIL_COUNT"
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
