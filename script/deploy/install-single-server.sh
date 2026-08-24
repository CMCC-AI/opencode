#!/usr/bin/env bash
set -euo pipefail

render_opencode_service() {
  cat <<EOF
[Unit]
Description=OpenCode CMCC
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$service_user
Group=$service_user
WorkingDirectory=$workspace_root
Environment=HOME=$service_home
Environment=XDG_DATA_HOME=$data_root/data
Environment=XDG_CONFIG_HOME=$data_root/config
Environment=XDG_STATE_HOME=$data_root/state
Environment=XDG_CACHE_HOME=$data_root/cache
Environment=OPENCODE_DISABLE_AUTOUPDATE=true
# OPENCODE_CONFIG_DIR is already a discovered global config root. Setting the
# same path as OPENCODE_BUNDLED_CONFIG_DIR would rescan experts for local configs.
Environment=OPENCODE_CONFIG_DIR=$install_root/current/.opencode
EnvironmentFile=/etc/opencode-cmcc/opencode.env
ExecStart=$install_root/current/opencode serve --hostname $bind_host --port $port
Restart=always
RestartSec=3
TimeoutStopSec=15
MemoryHigh=3G
MemoryMax=3584M
StartLimitIntervalSec=60
StartLimitBurst=5
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
}

render_deepxiv_service() {
  cat <<EOF
[Unit]
Description=OpenCode CMCC DeepXiv Proxy
After=network-online.target opencode-cmcc.service
Wants=network-online.target
PartOf=opencode-cmcc.service

[Service]
Type=simple
User=$service_user
Group=$service_user
WorkingDirectory=$workspace_root
EnvironmentFile=/etc/opencode-cmcc/deepxiv.env
ExecStart=$install_root/current/deepxiv-proxy
Restart=always
RestartSec=3
TimeoutStopSec=15
MemoryHigh=512M
MemoryMax=768M
StartLimitIntervalSec=60
StartLimitBurst=5
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
}

render_logrotate_config() {
  cat <<EOF
$data_root/data/opencode/log/*.log {
  daily
  rotate 14
  maxsize 20M
  compress
  delaycompress
  missingok
  notifempty
  copytruncate
  su $service_user $service_user
}
EOF
}

wait_for_health() {
  local attempt
  for ((attempt = 0; attempt < 15; attempt++)); do
    if curl --disable --fail --silent --output /dev/null --max-time 2 --noproxy '*' \
      --header "Authorization: Basic $health_auth" "http://127.0.0.1:$port/global/health"; then
      return 0
    fi
    if ((attempt < 14)); then
      sleep 1
    fi
  done
  return 1
}

if [[ ${BASH_SOURCE[0]} != "$0" ]]; then
  return 0
fi

if [[ $EUID -ne 0 ]]; then
  echo "install-single-server.sh must run as root" >&2
  exit 1
fi

release_dir=${1:?release directory is required}
service_user=${2:-ubuntu}
install_root=${OPENCODE_INSTALL_ROOT:-/opt/opencode-cmcc}
data_root=${OPENCODE_DATA_ROOT:-/var/lib/opencode-cmcc}
workspace_root=${OPENCODE_WORKSPACE_ROOT:-/srv/opencode/workspaces}
bind_host=${OPENCODE_BIND_HOST:-127.0.0.1}
port=${OPENCODE_PORT:-4096}
keep_releases=${OPENCODE_KEEP_RELEASES:-3}
version=$(<"$release_dir/VERSION")
target="$install_root/releases/$version"

if [[ ! $keep_releases =~ ^[1-9][0-9]*$ ]]; then
  echo "OPENCODE_KEEP_RELEASES must be a positive integer" >&2
  exit 1
fi

if ! id "$service_user" >/dev/null 2>&1; then
  echo "Service user does not exist: $service_user" >&2
  exit 1
fi
service_home=$(getent passwd "$service_user" | cut -d: -f6)
if [[ ! -d $release_dir/.opencode/experts ]]; then
  echo "Expert configuration is missing: $release_dir/.opencode/experts" >&2
  exit 1
fi
if [[ ! -f $release_dir/.opencode/opencode.jsonc ]]; then
  echo "CMCC model configuration is missing: $release_dir/.opencode/opencode.jsonc" >&2
  exit 1
fi
if [[ ! -s $release_dir/opencode ]]; then
  echo "OpenCode binary is missing: $release_dir/opencode" >&2
  exit 1
fi
if [[ ! -s $release_dir/deepxiv-proxy ]]; then
  echo "DeepXiv proxy binary is missing: $release_dir/deepxiv-proxy" >&2
  exit 1
fi
if [[ ! -f $release_dir/opencode.env ]]; then
  echo "OpenCode environment is missing: $release_dir/opencode.env" >&2
  exit 1
fi
if [[ ! -f $release_dir/health-auth ]]; then
  echo "OpenCode health credentials are missing: $release_dir/health-auth" >&2
  exit 1
fi
if [[ ! -f $release_dir/deepxiv.env ]]; then
  echo "DeepXiv proxy environment is missing: $release_dir/deepxiv.env" >&2
  exit 1
fi
health_auth=$(<"$release_dir/health-auth")
if [[ ! $health_auth =~ ^[A-Za-z0-9+/]+={0,2}$ ]]; then
  echo "OpenCode health credentials are invalid" >&2
  exit 1
fi

install -d -m 0755 "$install_root/releases" "$target" "$workspace_root"
install -d -o "$service_user" -g "$service_user" -m 0750 \
  "$data_root/data" \
  "$data_root/config" \
  "$data_root/state" \
  "$data_root/cache"
install -o root -g root -m 0755 "$release_dir/opencode" "$target/opencode"
install -o root -g root -m 0755 "$release_dir/deepxiv-proxy" "$target/deepxiv-proxy"
install -d -o root -g root -m 0755 "$target/.opencode"
cp -a "$release_dir/.opencode/." "$target/.opencode/"
chown -R root:root "$target/.opencode"
chmod -R a+rX "$target/.opencode"
install -d -m 0755 /etc/opencode-cmcc
install -o root -g root -m 0600 "$release_dir/opencode.env" /etc/opencode-cmcc/opencode.env
install -o root -g root -m 0600 "$release_dir/deepxiv.env" /etc/opencode-cmcc/deepxiv.env
ln -sfn "$target" "$install_root/current"
chown "$service_user:$service_user" "$workspace_root"

render_opencode_service >/etc/systemd/system/opencode-cmcc.service
render_deepxiv_service >/etc/systemd/system/opencode-cmcc-deepxiv.service
if [[ -d /etc/logrotate.d ]]; then
  render_logrotate_config >/etc/logrotate.d/opencode-cmcc
fi

systemctl daemon-reload
systemctl enable opencode-cmcc.service opencode-cmcc-deepxiv.service
systemctl restart opencode-cmcc.service opencode-cmcc-deepxiv.service

if ! wait_for_health; then
  systemctl status opencode-cmcc.service opencode-cmcc-deepxiv.service --no-pager --lines=30 || true
  journalctl -u opencode-cmcc.service -u opencode-cmcc-deepxiv.service --no-pager --lines=80 || true
  echo "OpenCode CMCC failed its post-deployment health check on 127.0.0.1:$port" >&2
  exit 1
fi

systemctl is-active --quiet opencode-cmcc.service
systemctl is-active --quiet opencode-cmcc-deepxiv.service

current=$(readlink -f "$install_root/current")
kept=1
while IFS= read -r release; do
  if [[ $release == "$current" ]]; then
    continue
  fi
  if ((kept < keep_releases)); then
    kept=$((kept + 1))
    continue
  fi
  rm -rf -- "$release"
done < <(find "$install_root/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)

for previous_stage in /tmp/opencode-cmcc-*; do
  if [[ ! -d $previous_stage || $previous_stage == "$release_dir" ]]; then
    continue
  fi
  rm -rf -- "$previous_stage"
done

echo "OpenCode CMCC $version is running on $bind_host:$port with the DeepXiv proxy"
