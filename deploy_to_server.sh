#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
remote=${DEPLOY_HOST:-ubuntu@81.70.49.200}
port=${OPENCODE_PORT:-4096}
bind_host=${OPENCODE_BIND_HOST:-127.0.0.1}
public_host=${OPENCODE_PUBLIC_HOST:-${remote#*@}}
public_scheme=${OPENCODE_PUBLIC_SCHEME:-http}
public_port=${OPENCODE_PUBLIC_PORT:-3002}
service_user=${OPENCODE_SERVICE_USER:-${remote%@*}}
keep_releases=${OPENCODE_KEEP_RELEASES:-3}
install_root=${OPENCODE_INSTALL_ROOT:-/opt/opencode-cmcc}
upload_mode=${DEPLOY_UPLOAD_MODE:-delta}
deepxiv_port=${DEEPXIV_PROXY_PORT:-3100}
deepxiv_bind_host=${DEEPXIV_PROXY_HOST:-0.0.0.0}
deeplit_target=${DEEPLIT_PROXY_TARGET:-http://81.70.174.140:3000/}
deeplit_public_origin=${DEEPLIT_PROXY_PUBLIC_ORIGIN:-$public_scheme://$public_host:$deepxiv_port}
deeplit_trust_forwarded_headers=${DEEPLIT_PROXY_TRUST_FORWARD_HEADERS:-false}
requested_deepxiv_url=${VITE_DEEPXIV_URL:-}
deploy_dir="$root/.deploy"
version=${OPENCODE_VERSION:-0.0.0-cmcc-$(date +%Y%m%d%H%M%S)}

if [[ ! $keep_releases =~ ^[1-9][0-9]*$ ]]; then
  echo "OPENCODE_KEEP_RELEASES must be a positive integer" >&2
  exit 1
fi
if [[ $upload_mode != delta && $upload_mode != bundle ]]; then
  echo "DEPLOY_UPLOAD_MODE must be delta or bundle" >&2
  exit 1
fi
if [[ ! $version =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "OPENCODE_VERSION may only contain letters, numbers, dots, underscores, and hyphens" >&2
  exit 1
fi
if [[ $public_scheme != http && $public_scheme != https ]]; then
  echo "OPENCODE_PUBLIC_SCHEME must be http or https" >&2
  exit 1
fi
if [[ ! $public_port =~ ^[1-9][0-9]*$ ]] || ((10#$public_port > 65535)); then
  echo "OPENCODE_PUBLIC_PORT must be an integer between 1 and 65535" >&2
  exit 1
fi
if [[ ! $port =~ ^[1-9][0-9]*$ ]] || ((10#$port > 65535)); then
  echo "OPENCODE_PORT must be an integer between 1 and 65535" >&2
  exit 1
fi
if [[ ! $deepxiv_port =~ ^[1-9][0-9]*$ ]] || ((10#$deepxiv_port > 65535)); then
  echo "DEEPXIV_PROXY_PORT must be an integer between 1 and 65535" >&2
  exit 1
fi
if [[ $deepxiv_port == "$port" ]]; then
  echo "DEEPXIV_PROXY_PORT must differ from OPENCODE_PORT" >&2
  exit 1
fi
normalize_origin() {
  bun -e '
    const value = process.argv[1]
    if (!URL.canParse(value)) process.exit(1)
    const url = new URL(value)
    if (!["http:", "https:"].includes(url.protocol)) process.exit(1)
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) process.exit(1)
    process.stdout.write(url.origin)
  ' "$1"
}
if ! deeplit_target=$(normalize_origin "$deeplit_target"); then
  echo "DEEPLIT_PROXY_TARGET must be an http or https origin" >&2
  exit 1
fi
if ! deeplit_public_origin=$(normalize_origin "$deeplit_public_origin"); then
  echo "DEEPLIT_PROXY_PUBLIC_ORIGIN must be an http or https origin" >&2
  exit 1
fi
if [[ -n $requested_deepxiv_url ]]; then
  if ! requested_deepxiv_origin=$(normalize_origin "$requested_deepxiv_url"); then
    echo "VITE_DEEPXIV_URL must be an http or https origin" >&2
    exit 1
  fi
  if [[ $requested_deepxiv_origin != "$deeplit_public_origin" ]]; then
    echo "VITE_DEEPXIV_URL must match DEEPLIT_PROXY_PUBLIC_ORIGIN" >&2
    exit 1
  fi
fi
deepxiv_url="$deeplit_public_origin/"
if [[ $deeplit_trust_forwarded_headers != true && $deeplit_trust_forwarded_headers != false ]]; then
  echo "DEEPLIT_PROXY_TRUST_FORWARD_HEADERS must be true or false" >&2
  exit 1
fi

mkdir -p "$deploy_dir"
chmod 700 "$deploy_dir"

validate_models_snapshot() {
  bun -e '
    const value = await Bun.file(process.argv[1]).json()
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) process.exit(1)
  ' "$1"
}

prepare_models_snapshot() {
  if [[ -n ${MODELS_DEV_API_JSON:-} ]]; then
    if [[ ! -f $MODELS_DEV_API_JSON ]] || ! validate_models_snapshot "$MODELS_DEV_API_JSON"; then
      echo "MODELS_DEV_API_JSON must point to a valid models.dev API snapshot" >&2
      exit 1
    fi
    models_snapshot=$MODELS_DEV_API_JSON
    return
  fi

  models_snapshot="$deploy_dir/models-dev-api.json"
  local download
  download=$(mktemp "$deploy_dir/models-dev-api.XXXXXX")
  if curl -L --fail --silent --show-error --max-time 30 https://models.dev/api.json -o "$download" && \
    validate_models_snapshot "$download"; then
    mv "$download" "$models_snapshot"
    chmod 600 "$models_snapshot"
    return
  fi

  rm -f -- "$download"
  if [[ -f $models_snapshot ]] && validate_models_snapshot "$models_snapshot"; then
    echo "Warning: models.dev is unavailable; using the last verified local snapshot" >&2
    return
  fi
  echo "Unable to download a valid models.dev snapshot and no verified cache is available" >&2
  exit 1
}

echo "Detecting remote architecture: $remote"
remote_arch=${DEPLOY_ARCH:-}
if [[ -z $remote_arch ]]; then
  remote_arch=$(ssh -o BatchMode=yes -o ConnectTimeout=30 "$remote" uname -m)
fi
case "$remote_arch" in
  x86_64 | amd64)
    target=opencode-linux-x64-baseline
    proxy_target=bun-linux-x64-baseline
    ;;
  aarch64 | arm64)
    target=opencode-linux-arm64
    proxy_target=bun-linux-arm64
    ;;
  *)
    echo "Unsupported remote architecture: $remote_arch" >&2
    exit 1
    ;;
esac

prepare_compile_runtime() {
  if [[ -n ${OPENCODE_BUN_EXECUTABLE_PATH:-} ]]; then
    if [[ ! -f $OPENCODE_BUN_EXECUTABLE_PATH ]]; then
      echo "OPENCODE_BUN_EXECUTABLE_PATH does not exist: $OPENCODE_BUN_EXECUTABLE_PATH" >&2
      exit 1
    fi
    compile_runtime_path=$OPENCODE_BUN_EXECUTABLE_PATH
  else
    local bun_version
    local runtime_dir
    local runtime_archive
    local runtime_cache_root
    local runtime_extract_dir
    local runtime_url
    bun_version=$(bun --version)
    runtime_cache_root=${OPENCODE_BUN_CACHE_DIR:-}
    if [[ -z $runtime_cache_root ]]; then
      if command -v cygpath >/dev/null 2>&1 && [[ -n ${LOCALAPPDATA:-} ]]; then
        runtime_cache_root="$(cygpath -u "$LOCALAPPDATA")/opencode-cmcc/bun-runtime"
      else
        runtime_cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/opencode-cmcc/bun-runtime"
      fi
    fi
    runtime_dir="$runtime_cache_root/$bun_version/$proxy_target"
    compile_runtime_path="$runtime_dir/bun"

    if [[ ! -s $compile_runtime_path ]]; then
      runtime_archive="$runtime_dir/$proxy_target-$bun_version.tgz.part"
      runtime_extract_dir="$runtime_dir/extract.$$"
      runtime_url="https://registry.npmjs.org/@oven/$proxy_target/-/$proxy_target-$bun_version.tgz"
      mkdir -p "$runtime_extract_dir"
      echo "Downloading Bun compile runtime: $proxy_target v$bun_version"
      curl --fail --location \
        --connect-timeout 15 \
        --retry 3 \
        --retry-delay 2 \
        --retry-all-errors \
        --output "$runtime_archive" \
        "$runtime_url"
      tar -xzf "$runtime_archive" \
        --strip-components=2 \
        -C "$runtime_extract_dir" \
        package/bin/bun
      if [[ ! -s $runtime_extract_dir/bun ]]; then
        echo "Downloaded Bun compile runtime is empty: $runtime_url" >&2
        exit 1
      fi
      mv -f "$runtime_extract_dir/bun" "$compile_runtime_path"
      chmod 0755 "$compile_runtime_path"
      rm -rf "$runtime_extract_dir"
      rm -f "$runtime_archive"
    else
      echo "Using cached Bun compile runtime: $compile_runtime_path"
    fi
  fi

  if command -v cygpath >/dev/null 2>&1; then
    compile_runtime_path=$(cygpath -m "$compile_runtime_path")
  fi
}

if [[ ${DEPLOY_SKIP_BUILD:-0} != 1 ]]; then
  prepare_compile_runtime
  prepare_models_snapshot
  echo "Building APP-CMCC and OpenCode for $target"
  (
    cd "$root/packages/opencode"
    OPENCODE_VERSION="$version" \
      OPENCODE_CHANNEL=cmcc \
      OPENCODE_BUN_EXECUTABLE_PATH="$compile_runtime_path" \
      OPENCODE_WEB_APP_DIR="$root/packages/app-cmcc" \
      MODELS_DEV_API_JSON="$models_snapshot" \
      VITE_DEEPXIV_URL="$deepxiv_url" \
      bun run script/build.ts --target="$target"
  )
  echo "Building DeepXiv proxy for $proxy_target"
  bun build --compile \
    --compile-executable-path="$compile_runtime_path" \
    --no-compile-autoload-dotenv \
    --no-compile-autoload-bunfig \
    --no-compile-autoload-tsconfig \
    --no-compile-autoload-package-json \
    --target="$proxy_target" \
    --outfile="$root/packages/opencode/dist/$target/bin/deepxiv-proxy" \
    "$root/packages/app-cmcc/scripts/run-deepxiv-proxy.ts"
  printf '%s\n' "$deepxiv_url" >"$root/packages/opencode/dist/$target/DEEPXIV_URL"
fi

if [[ ! -s $root/packages/opencode/dist/$target/bin/opencode ]]; then
  echo "Missing build output: packages/opencode/dist/$target/bin/opencode" >&2
  exit 1
fi
if [[ ! -s $root/packages/opencode/dist/$target/bin/deepxiv-proxy ]]; then
  echo "Missing build output: packages/opencode/dist/$target/bin/deepxiv-proxy" >&2
  exit 1
fi
if [[ ! -f $root/packages/opencode/dist/$target/DEEPXIV_URL ]] || \
  [[ $(<"$root/packages/opencode/dist/$target/DEEPXIV_URL") != "$deepxiv_url" ]]; then
  echo "Build output does not match the configured DeepXiv URL; rebuild without DEPLOY_SKIP_BUILD" >&2
  exit 1
fi

stage=$(mktemp -d "${TMPDIR:-/tmp}/opencode-cmcc.XXXXXX")
trap 'rm -rf "$stage"' EXIT
install -m 0755 "$root/packages/opencode/dist/$target/bin/opencode" "$stage/opencode"
install -m 0755 "$root/packages/opencode/dist/$target/bin/deepxiv-proxy" "$stage/deepxiv-proxy"
install -m 0755 "$root/script/deploy/install-single-server.sh" "$stage/install-single-server.sh"
install -d -m 0755 "$stage/.opencode"
install -m 0644 "$root/script/deploy/opencode-cmcc.jsonc" "$stage/.opencode/opencode.jsonc"
cp -a "$root/.opencode/experts" "$stage/.opencode/experts"
cp -a "$root/.opencode/skills" "$stage/.opencode/skills"
# Expert bundles keep their skills under experts/<team>/skills/, but the skill
# scanner only matches {skill,skills}/**/SKILL.md from the config root, so
# flatten expert skills into the bundled skills directory as well.
for skill_dir in "$root"/.opencode/experts/*/skills/*/; do
  [[ -f "${skill_dir}SKILL.md" ]] || continue
  cp -a "${skill_dir%/}" "$stage/.opencode/skills/"
done
printf '%s\n' "$version" >"$stage/VERSION"
printf 'DEEPLIT_PROXY_PUBLIC_ORIGIN=%q\n' "$deeplit_public_origin" >"$stage/opencode.env"
chmod 600 "$stage/opencode.env"
printf 'DEEPXIV_PROXY_HOST=%q\nDEEPXIV_PROXY_PORT=%q\nDEEPLIT_PROXY_TARGET=%q\nDEEPLIT_PROXY_PUBLIC_ORIGIN=%q\nDEEPLIT_PROXY_TRUST_FORWARD_HEADERS=%q\n' \
  "$deepxiv_bind_host" \
  "$deepxiv_port" \
  "$deeplit_target" \
  "$deeplit_public_origin" \
  "$deeplit_trust_forwarded_headers" >"$stage/deepxiv.env"

cleanup_local_bundles() {
  local count=0
  local file
  while IFS= read -r file; do
    count=$((count + 1))
    if ((count > keep_releases)); then
      rm -f -- "$file"
    fi
  done < <(ls -1t "$deploy_dir"/opencode-cmcc-*.tar.gz 2>/dev/null || true)
}

bundle="$deploy_dir/opencode-cmcc-$version-$remote_arch.tar.gz"
create_bundle() {
  echo "Creating offline bundle"
  COPYFILE_DISABLE=1 tar -C "$stage" -czf "$bundle" .
  cleanup_local_bundles
}

if [[ ${DEPLOY_BUILD_ONLY:-0} == 1 ]]; then
  create_bundle
  echo "Offline bundle created: $bundle"
  exit 0
fi

remote_stage="/tmp/opencode-cmcc-$version"
if [[ $upload_mode == delta ]] && ! command -v rsync >/dev/null 2>&1; then
  echo "Local rsync is unavailable; falling back to compressed bundle upload"
  upload_mode=bundle
fi
if [[ $upload_mode == delta ]]; then
  if ! ssh "$remote" "command -v rsync >/dev/null 2>&1 && test -x '$install_root/current/opencode'"; then
    echo "Remote rsync or current binary is unavailable; falling back to compressed bundle upload"
    upload_mode=bundle
  fi
fi

delta_uploaded=0
if [[ $upload_mode == delta ]]; then
  echo "Seeding the remote release from the current binary"
  if ! ssh "$remote" \
    "rm -rf -- '$remote_stage' && mkdir -p '$remote_stage/release' && cp --reflink=auto --preserve=mode,timestamps '$install_root/current/opencode' '$remote_stage/release/opencode' && if test -x '$install_root/current/deepxiv-proxy'; then cp --reflink=auto --preserve=mode,timestamps '$install_root/current/deepxiv-proxy' '$remote_stage/release/deepxiv-proxy'; fi"; then
    echo "Unable to prepare the remote delta base; falling back to compressed bundle upload" >&2
    upload_mode=bundle
  fi
fi

if [[ $upload_mode == delta ]]; then
  echo "Uploading changed binary blocks"
  # The seeded destination is the rolling-checksum basis; never let metadata skip the content comparison.
  if rsync --archive --ignore-times --no-whole-file --partial-dir=.rsync-partial --compress --progress --stats \
    "$stage/" \
    "$remote:$remote_stage/release/"; then
    local_sha256=$(shasum -a 256 "$stage/opencode" | awk '{print $1}')
    local_proxy_sha256=$(shasum -a 256 "$stage/deepxiv-proxy" | awk '{print $1}')
    if remote_sha256=$(ssh "$remote" "sha256sum '$remote_stage/release/opencode' | awk '{print \$1}'") && \
      remote_proxy_sha256=$(ssh "$remote" "sha256sum '$remote_stage/release/deepxiv-proxy' | awk '{print \$1}'") && \
      [[ $local_sha256 == "$remote_sha256" && $local_proxy_sha256 == "$remote_proxy_sha256" ]]; then
      delta_uploaded=1
    else
      echo "Delta SHA-256 verification failed; falling back to compressed bundle upload" >&2
      upload_mode=bundle
    fi
  else
    echo "Delta upload failed; falling back to compressed bundle upload" >&2
    upload_mode=bundle
  fi
fi

if [[ $delta_uploaded == 1 ]]; then
  echo "Installing the verified delta release and restarting the service"
  ssh -t "$remote" \
    "sudo env OPENCODE_INSTALL_ROOT='$install_root' OPENCODE_BIND_HOST='$bind_host' OPENCODE_PORT='$port' OPENCODE_KEEP_RELEASES='$keep_releases' bash '$remote_stage/release/install-single-server.sh' '$remote_stage/release' '$service_user' && rm -rf -- '$remote_stage'"
else
  create_bundle
  echo "Uploading one compressed offline bundle"
  ssh "$remote" "rm -rf -- '$remote_stage' && mkdir -p '$remote_stage'"
  if command -v rsync >/dev/null 2>&1 && ssh "$remote" command -v rsync >/dev/null 2>&1; then
    rsync --partial --progress "$bundle" "$remote:$remote_stage/release.tar.gz"
  else
    scp "$bundle" "$remote:$remote_stage/release.tar.gz"
  fi

  echo "Installing the bundle release and restarting the service"
  ssh -t "$remote" \
    "tar -xzf '$remote_stage/release.tar.gz' -C '$remote_stage' && sudo env OPENCODE_INSTALL_ROOT='$install_root' OPENCODE_BIND_HOST='$bind_host' OPENCODE_PORT='$port' OPENCODE_KEEP_RELEASES='$keep_releases' bash '$remote_stage/install-single-server.sh' '$remote_stage' '$service_user' && rm -rf -- '$remote_stage'"
fi

echo
echo "Deployment complete."
public_origin="$public_scheme://$public_host"
if [[ ($public_scheme == http && $public_port != 80) || ($public_scheme == https && $public_port != 443) ]]; then
  public_origin="$public_origin:$public_port"
fi
echo "APP-CMCC URL: $public_origin/"
echo "DeepXiv proxy URL: $deepxiv_url"
echo "Ensure TCP ports $public_port and $deepxiv_port are allowed by the server firewall and cloud security group."
