#!/usr/bin/env bash

quota_validate() {
  if [[ ${OPENCODE_DOCKAPI_QUOTA_ENABLED:-} != true && ${OPENCODE_DOCKAPI_QUOTA_ENABLED:-} != false ]]; then
    echo "OPENCODE_DOCKAPI_QUOTA_ENABLED must be explicitly true or false" >&2
    return 1
  fi
  if [[ $OPENCODE_DOCKAPI_QUOTA_ENABLED == false ]]; then
    return 0
  fi
  local origin='^https?://(\[[0-9a-fA-F:]+\]|[[:alnum:]_.-]+)(:([0-9]+))?/?$'
  if [[ ! ${OPENCODE_DOCKAPI_URL:-} =~ $origin ]]; then
    echo "OPENCODE_DOCKAPI_URL must be a DockAPI http(s) origin without /api, credentials, query or fragment" >&2
    return 1
  fi
  local port=${BASH_REMATCH[3]}
  if [[ -n $port ]] && { ((${#port} > 5)) || ((10#$port < 1 || 10#$port > 65535)); }; then
    echo "OPENCODE_DOCKAPI_URL contains an invalid port" >&2
    return 1
  fi
  local token=${DOCKAPI_QUOTA_SERVICE_TOKEN:-}
  local LC_ALL=C
  if ((${#token} < 32)) || [[ $token == *[![:graph:]]* ]]; then
    echo "DOCKAPI_QUOTA_SERVICE_TOKEN must contain at least 32 printable non-whitespace ASCII characters" >&2
    return 1
  fi
}

quota_assignment() {
  local value=${2//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//\$/\\\$}
  value=${value//\`/\\\`}
  printf '%s="%s"\n' "$1" "$value"
}

quota_render() {
  quota_validate || return 1
  quota_assignment OPENCODE_DOCKAPI_QUOTA_ENABLED "$OPENCODE_DOCKAPI_QUOTA_ENABLED"
  if [[ $OPENCODE_DOCKAPI_QUOTA_ENABLED == true ]]; then
    quota_assignment OPENCODE_DOCKAPI_URL "${OPENCODE_DOCKAPI_URL%/}"
    quota_assignment DOCKAPI_QUOTA_SERVICE_TOKEN "$DOCKAPI_QUOTA_SERVICE_TOKEN"
  fi
}

# Read only administrator-controlled Bash env files.
quota_from_file() {
  local OPENCODE_DOCKAPI_QUOTA_ENABLED OPENCODE_DOCKAPI_URL DOCKAPI_QUOTA_SERVICE_TOKEN
  unset OPENCODE_DOCKAPI_QUOTA_ENABLED OPENCODE_DOCKAPI_URL DOCKAPI_QUOTA_SERVICE_TOKEN
  if [[ ! -f $1 ]]; then
    echo "Quota environment file does not exist" >&2
    return 1
  fi
  if ! source "$1" >/dev/null 2>&1; then
    echo "Unable to read quota environment file; check its Bash assignment syntax" >&2
    return 1
  fi
  set +vx
  if [[ ${2:-} == optional && -z ${OPENCODE_DOCKAPI_QUOTA_ENABLED+x}${OPENCODE_DOCKAPI_URL+x}${DOCKAPI_QUOTA_SERVICE_TOKEN+x} ]]; then
    return 0
  fi
  quota_render
}

quota_local_config() {
  local enabled_set=${OPENCODE_DOCKAPI_QUOTA_ENABLED+x} enabled=${OPENCODE_DOCKAPI_QUOTA_ENABLED:-}
  local url_set=${OPENCODE_DOCKAPI_URL+x} url=${OPENCODE_DOCKAPI_URL:-}
  local token_set=${DOCKAPI_QUOTA_SERVICE_TOKEN+x} token=${DOCKAPI_QUOTA_SERVICE_TOKEN:-}
  local OPENCODE_DOCKAPI_QUOTA_ENABLED=${OPENCODE_DOCKAPI_QUOTA_ENABLED:-}
  local OPENCODE_DOCKAPI_URL=${OPENCODE_DOCKAPI_URL:-} DOCKAPI_QUOTA_SERVICE_TOKEN=${DOCKAPI_QUOTA_SERVICE_TOKEN:-}
  if [[ -f $1 ]]; then
    unset OPENCODE_DOCKAPI_QUOTA_ENABLED OPENCODE_DOCKAPI_URL DOCKAPI_QUOTA_SERVICE_TOKEN
    if ! source "$1" >/dev/null 2>&1; then
      echo "Unable to read quota environment file; check its Bash assignment syntax" >&2
      return 1
    fi
    set +vx
  elif [[ ${2:-} == required ]]; then
    echo "OPENCODE_QUOTA_ENV_FILE does not exist" >&2
    return 1
  elif [[ -z $enabled_set$url_set$token_set ]]; then
    return 0
  fi
  if [[ -n $enabled_set ]]; then OPENCODE_DOCKAPI_QUOTA_ENABLED=$enabled; fi
  if [[ -n $url_set ]]; then OPENCODE_DOCKAPI_URL=$url; fi
  if [[ -n $token_set ]]; then DOCKAPI_QUOTA_SERVICE_TOKEN=$token; fi
  quota_render
}

quota_resolve() {
  if [[ -n $1 ]]; then
    quota_from_file "$1"
    return
  fi
  if [[ -f $2 ]]; then
    quota_from_file "$2"
    return
  fi
  if [[ -f $3 ]]; then
    local legacy
    legacy=$(quota_from_file "$3" optional) || return 1
    if [[ -n $legacy ]]; then
      printf '%s\n' "$legacy"
      return
    fi
  fi
  if [[ -n ${4:-} && -f $4 && $(<"$4") == *"EnvironmentFile=$2"* ]]; then
    echo "Existing quota environment file is missing; restore it or provide a new quota configuration" >&2
    return 1
  fi
  quota_assignment OPENCODE_DOCKAPI_QUOTA_ENABLED false
}

quota_install() {
  local target=$2 temporary
  if [[ -f $target ]] && [[ $(<"$target") == "$1" ]]; then
    chmod 0600 "$target"
    return
  fi
  temporary=$(mktemp "$target.XXXXXX") || return 1
  if ! printf '%s\n' "$1" >"$temporary" || ! chmod 0600 "$temporary" || ! mv -f -- "$temporary" "$target"; then
    rm -f -- "$temporary"
    return 1
  fi
}
