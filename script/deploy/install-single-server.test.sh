#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
installer="$script_dir/install-single-server.sh"
deployer="$script_dir/../../deploy_to_server.sh"

# Sourcing exposes the render and health-check functions without executing the installer.
# shellcheck source=install-single-server.sh
source "$installer"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

assert_contains() {
  if [[ $1 != *"$2"* ]]; then
    fail "expected output to contain: $2"
  fi
}

assert_not_contains() {
  if [[ $1 == *"$2"* ]]; then
    fail "expected output not to contain: $2"
  fi
}

has_curl_argument() {
  local expected=$1
  local value
  for value in "${curl_args[@]}"; do
    if [[ $value == "$expected" ]]; then
      return 0
    fi
  done
  return 1
}

bash -n "$installer"
bash -n "$deployer"

service_user=opencode-test
service_home=/home/opencode-test
install_root=/opt/opencode-test
data_root=/var/lib/opencode-test
workspace_root=/srv/opencode-test
bind_host=127.0.0.1
port=14096

unit=$(render_opencode_service)
assert_contains "$unit" "Environment=OPENCODE_CONFIG_DIR=/opt/opencode-test/current/.opencode"
assert_not_contains "$unit" "Environment=OPENCODE_BUNDLED_CONFIG_DIR="
assert_contains "$unit" "WorkingDirectory=/srv/opencode-test"
assert_contains "$unit" "Environment=HOME=/home/opencode-test"

deepxiv_unit=$(render_deepxiv_service)
assert_contains "$deepxiv_unit" "PartOf=opencode-cmcc.service"
assert_contains "$deepxiv_unit" "ExecStart=/opt/opencode-test/current/deepxiv-proxy"

logrotate=$(render_logrotate_config)
assert_contains "$logrotate" "/var/lib/opencode-test/data/opencode/log/*.log"
assert_contains "$logrotate" "maxsize 20M"
assert_contains "$logrotate" "copytruncate"
assert_contains "$logrotate" "su opencode-test opencode-test"

health_auth=b3BlbmNvZGU6dGVzdC1wYXNzd29yZA==
curl_calls=0
sleep_calls=0
curl_args=()
curl() {
  curl_calls=$((curl_calls + 1))
  curl_args=("$@")
  if ((curl_calls < 2)); then
    return 22
  fi
  return 0
}
sleep() {
  sleep_calls=$((sleep_calls + 1))
}

wait_for_health
[[ $curl_calls == 2 ]] || fail "health check did not retry exactly once"
[[ $sleep_calls == 1 ]] || fail "health check did not wait between retries"
has_curl_argument --fail || fail "health check does not reject HTTP errors"
has_curl_argument --header || fail "health check does not send service credentials"
has_curl_argument "Authorization: Basic $health_auth" || fail "health check sent unexpected credentials"
has_curl_argument "http://127.0.0.1:14096/global/health" || fail "health check uses the wrong endpoint"

curl_calls=0
sleep_calls=0
curl() {
  curl_calls=$((curl_calls + 1))
  return 22
}
if wait_for_health; then
  fail "health check accepted repeated HTTP failures"
fi
[[ $curl_calls == 15 ]] || fail "health check used an unexpected attempt count"
[[ $sleep_calls == 14 ]] || fail "health check slept after the final attempt"

installer_source=$(<"$installer")
deployer_source=$(<"$deployer")
assert_contains "$installer_source" "systemctl enable opencode-cmcc.service opencode-cmcc-deepxiv.service"
assert_contains "$installer_source" "systemctl restart opencode-cmcc.service opencode-cmcc-deepxiv.service"
assert_not_contains "$installer_source" "systemctl enable --now"
assert_contains "$installer_source" 'health_auth=$(<"$release_dir/health-auth")'
assert_contains "$deployer_source" '>"$stage/health-auth"'

echo "install-single-server tests passed"
