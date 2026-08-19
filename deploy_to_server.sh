#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
remote=${DEPLOY_HOST:-ubuntu@81.70.49.200}
port=${OPENCODE_PORT:-4096}
bind_host=${OPENCODE_BIND_HOST:-0.0.0.0}
public_host=${OPENCODE_PUBLIC_HOST:-${remote#*@}}
public_scheme=${OPENCODE_PUBLIC_SCHEME:-http}
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
password_file="$deploy_dir/opencode-server-password"
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

if [[ -n ${OPENCODE_SERVER_PASSWORD:-} ]]; then
  password=$OPENCODE_SERVER_PASSWORD
  printf '%s\n' "$password" >"$password_file"
  chmod 600 "$password_file"
elif [[ -f $password_file ]]; then
  password=$(<"$password_file")
else
  password=$(openssl rand -hex 24)
  printf '%s\n' "$password" >"$password_file"
  chmod 600 "$password_file"
fi

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

if [[ ${DEPLOY_SKIP_BUILD:-0} != 1 ]]; then
  echo "Building APP-CMCC and OpenCode for $target"
  (
    cd "$root/packages/opencode"
    OPENCODE_VERSION="$version" \
      OPENCODE_CHANNEL=cmcc \
      OPENCODE_WEB_APP_DIR="$root/packages/app-cmcc" \
      VITE_DEEPXIV_URL="$deepxiv_url" \
      bun run script/build.ts --target="$target"
  )
  echo "Building DeepXiv proxy for $proxy_target"
  bun build --compile \
    --no-compile-autoload-dotenv \
    --no-compile-autoload-bunfig \
    --no-compile-autoload-tsconfig \
    --no-compile-autoload-package-json \
    --target="$proxy_target" \
    --outfile="$root/packages/opencode/dist/$target/bin/deepxiv-proxy" \
    "$root/packages/app-cmcc/scripts/run-deepxiv-proxy.ts"
  printf '%s\n' "$deepxiv_url" >"$root/packages/opencode/dist/$target/DEEPXIV_URL"
fi

if [[ ! -x $root/packages/opencode/dist/$target/bin/opencode ]]; then
  echo "Missing build output: packages/opencode/dist/$target/bin/opencode" >&2
  exit 1
fi
if [[ ! -x $root/packages/opencode/dist/$target/bin/deepxiv-proxy ]]; then
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
printf 'OPENCODE_SERVER_USERNAME=%q\nOPENCODE_SERVER_PASSWORD=%q\nDEEPLIT_PROXY_PUBLIC_ORIGIN=%q\n' \
  "${OPENCODE_SERVER_USERNAME:-opencode}" \
  "$password" \
  "$deeplit_public_origin" >"$stage/opencode.env"
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
  if ssh "$remote" command -v rsync >/dev/null 2>&1; then
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
auth_token=$(printf '%s:%s' "${OPENCODE_SERVER_USERNAME:-opencode}" "$password" | base64 | tr -d '\n')
if [[ $bind_host == 127.0.0.1 || $bind_host == localhost ]]; then
  echo "Open an SSH tunnel in another terminal:"
  echo "  ssh -N -L $port:127.0.0.1:$port $remote"
  echo "Then visit once: http://127.0.0.1:$port/?auth_token=$auth_token"
else
  echo "APP-CMCC URL: $public_scheme://$public_host:$port/?auth_token=$auth_token"
  echo "DeepXiv proxy URL: $deepxiv_url"
  echo "Ensure TCP ports $port and $deepxiv_port are allowed by the server firewall and cloud security group."
fi
echo "Username: ${OPENCODE_SERVER_USERNAME:-opencode}"
echo "Password: $password"
