#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/quota-env.sh"
temporary=$(mktemp -d "${TMPDIR:-/tmp}/opencode-quota-test.XXXXXX")
temporary=$(cd "$temporary" && pwd -P)
cleanup() {
  case "$temporary" in
    */opencode-quota-test.*) rm -rf -- "$temporary" ;;
    *) echo "Refusing to clean an unexpected test directory" >&2 ;;
  esac
}
trap cleanup EXIT

checks=0
fail() { echo "FAIL: $1" >&2; exit 1; }
assert_equal() {
  [[ $1 == "$2" ]] || fail "$3"
  checks=$((checks + 1))
  printf 'ok %s - %s\n' "$checks" "$3"
}
assert_rejected() {
  if "$@" >"$temporary/error.log" 2>&1; then fail "invalid quota configuration was accepted"; fi
  if [[ $(<"$temporary/error.log") == *"$secret"* ]]; then fail "validation error exposed the secret"; fi
  checks=$((checks + 1))
  printf 'ok %s - invalid configuration rejected\n' "$checks"
}

secret='quota-test-only-0123456789abcdef-$"\`'
unset OPENCODE_DOCKAPI_QUOTA_ENABLED OPENCODE_DOCKAPI_URL DOCKAPI_QUOTA_SERVICE_TOKEN
assert_equal "$(quota_local_config "$temporary/absent")" "" "missing local configuration must preserve the server"
assert_rejected quota_local_config "$temporary/absent" required

OPENCODE_DOCKAPI_QUOTA_ENABLED=true
OPENCODE_DOCKAPI_URL=http://127.0.0.1:8081/
DOCKAPI_QUOTA_SERVICE_TOKEN=$secret
rendered=$(quota_render)
printf '%s\n' "$rendered" >"$temporary/valid.env"
assert_equal "$(quota_from_file "$temporary/valid.env")" "$rendered" "quoted env values must round-trip"
actual=$(source "$temporary/valid.env"; printf '%s' "$DOCKAPI_QUOTA_SERVICE_TOKEN")
assert_equal "$actual" "$secret" "env serialization changed the secret"
actual=$(source "$temporary/valid.env"; printf '%s' "$OPENCODE_DOCKAPI_URL")
assert_equal "$actual" http://127.0.0.1:8081 "origin trailing slash was not normalized"

for invalid in '' TRUE 1 yes; do
  OPENCODE_DOCKAPI_QUOTA_ENABLED=$invalid
  assert_rejected quota_render
done
OPENCODE_DOCKAPI_QUOTA_ENABLED=true
for invalid in '' ftp://localhost:8081 http://localhost:8081/api http://user:password@localhost:8081 \
  'http://localhost:8081?token=anything' 'http://localhost:8081#fragment' http://localhost:0 http://localhost:65536; do
  OPENCODE_DOCKAPI_URL=$invalid
  assert_rejected quota_render
done
OPENCODE_DOCKAPI_URL=http://127.0.0.1:8081
for invalid in '' too-short 'quota-test-only-0123456789abcdef with-space' $'quota-test-only-0123456789abcdef\nnewline'; do
  DOCKAPI_QUOTA_SERVICE_TOKEN=$invalid
  assert_rejected quota_render
done
DOCKAPI_QUOTA_SERVICE_TOKEN=$secret
OPENCODE_DOCKAPI_URL='http://[::1]:8081'
quota_render > /dev/null
checks=$((checks + 1))
OPENCODE_DOCKAPI_URL=https://dockapi.internal
quota_render > /dev/null
checks=$((checks + 1))

OPENCODE_DOCKAPI_QUOTA_ENABLED=false
unset OPENCODE_DOCKAPI_URL DOCKAPI_QUOTA_SERVICE_TOKEN
disabled=$(quota_render)
assert_equal "$disabled" 'OPENCODE_DOCKAPI_QUOTA_ENABLED="false"' "disabled config must not need a secret"

unset OPENCODE_DOCKAPI_QUOTA_ENABLED
assert_equal "$(quota_local_config "$temporary/valid.env")" "$rendered" "private file was not loaded"
OPENCODE_DOCKAPI_QUOTA_ENABLED=false
assert_equal "$(quota_local_config "$temporary/valid.env")" "$disabled" "explicit environment must override the file"
unset OPENCODE_DOCKAPI_QUOTA_ENABLED
OPENCODE_DOCKAPI_URL=http://dockapi.internal:8081
overridden=$(quota_local_config "$temporary/valid.env")
printf '%s\n' "$overridden" >"$temporary/overridden.env"
assert_equal "$(OPENCODE_DOCKAPI_URL=; source "$temporary/overridden.env"; printf '%s' "$OPENCODE_DOCKAPI_URL")" \
  http://dockapi.internal:8081 "partial environment override did not retain file credentials"
unset OPENCODE_DOCKAPI_URL

assert_equal "$(quota_resolve '' "$temporary/valid.env" "$temporary/absent")" "$rendered" "existing server config was not preserved"
printf '%s\n' "$disabled" >"$temporary/disabled.env"
assert_equal "$(quota_resolve "$temporary/disabled.env" "$temporary/valid.env" "$temporary/absent")" \
  "$disabled" "incoming config must take priority"
printf 'DEEPLIT_PROXY_PUBLIC_ORIGIN="http://localhost:3100"\n%s\n' "$rendered" >"$temporary/legacy.env"
assert_equal "$(quota_resolve '' "$temporary/absent" "$temporary/legacy.env")" "$rendered" "legacy quota settings were lost"
printf 'DEEPLIT_PROXY_PUBLIC_ORIGIN="http://localhost:3100"\n' >"$temporary/public.env"
assert_equal "$(quota_resolve '' "$temporary/absent" "$temporary/public.env")" "$disabled" "new installs must keep the disabled default"
printf 'EnvironmentFile=%s\n' "$temporary/absent" >"$temporary/existing.service"
assert_rejected quota_resolve '' "$temporary/absent" "$temporary/public.env" "$temporary/existing.service"
assert_equal "$(quota_resolve "$temporary/valid.env" "$temporary/absent" "$temporary/public.env" "$temporary/existing.service")" \
  "$rendered" "incoming configuration must repair a missing server file"

printf 'OPENCODE_DOCKAPI_QUOTA_ENABLED=true\n' >"$temporary/invalid.env"
assert_rejected quota_resolve "$temporary/invalid.env" "$temporary/valid.env" "$temporary/legacy.env"
assert_rejected quota_resolve '' "$temporary/invalid.env" "$temporary/legacy.env"
printf '%s\n' "$secret" >"$temporary/syntax-error.env"
assert_rejected quota_from_file "$temporary/syntax-error.env"
assert_rejected quota_local_config "$temporary/syntax-error.env" required
assert_equal "$(<"$temporary/valid.env")" "$rendered" "failed validation modified the existing config"

quota_install "$rendered" "$temporary/installed.env"
assert_equal "$(<"$temporary/installed.env")" "$rendered" "install did not preserve the settings"
quota_install "$disabled" "$temporary/installed.env"
assert_equal "$(<"$temporary/installed.env")" "$disabled" "explicit disable was not installed"
quota_install "$disabled" "$temporary/installed.env"
assert_equal "$(<"$temporary/installed.env")" "$disabled" "repeated installation changed the configuration"
case "$(uname -s)" in
  MINGW* | MSYS*) echo "POSIX file mode assertion skipped on Windows" ;;
  *) assert_equal "$(stat -c %a "$temporary/installed.env")" 600 "quota env must be private" ;;
esac

echo "quota-env tests passed ($checks checks)"
