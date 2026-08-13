#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "install-single-server.sh must run as root" >&2
  exit 1
fi

release_dir=${1:?release directory is required}
service_user=${2:-ubuntu}
install_root=${OPENCODE_INSTALL_ROOT:-/opt/opencode-cmcc}
data_root=${OPENCODE_DATA_ROOT:-/var/lib/opencode-cmcc}
workspace_root=${OPENCODE_WORKSPACE_ROOT:-/srv/opencode/workspaces}
bind_host=${OPENCODE_BIND_HOST:-0.0.0.0}
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
if [[ ! -d $release_dir/.opencode/experts ]]; then
  echo "Expert configuration is missing: $release_dir/.opencode/experts" >&2
  exit 1
fi
if [[ ! -x $release_dir/deepxiv-proxy ]]; then
  echo "DeepXiv proxy binary is missing: $release_dir/deepxiv-proxy" >&2
  exit 1
fi
if [[ ! -f $release_dir/deepxiv.env ]]; then
  echo "DeepXiv proxy environment is missing: $release_dir/deepxiv.env" >&2
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

cat >/etc/systemd/system/opencode-cmcc.service <<EOF
[Unit]
Description=OpenCode CMCC
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$service_user
Group=$service_user
WorkingDirectory=$workspace_root
Environment=HOME=$(getent passwd "$service_user" | cut -d: -f6)
Environment=XDG_DATA_HOME=$data_root/data
Environment=XDG_CONFIG_HOME=$data_root/config
Environment=XDG_STATE_HOME=$data_root/state
Environment=XDG_CACHE_HOME=$data_root/cache
Environment=OPENCODE_DISABLE_AUTOUPDATE=true
Environment=OPENCODE_BUNDLED_CONFIG_DIR=$install_root/current/.opencode
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

cat >/etc/systemd/system/opencode-cmcc-deepxiv.service <<EOF
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

systemctl daemon-reload
systemctl enable --now opencode-cmcc.service opencode-cmcc-deepxiv.service
systemctl restart opencode-cmcc.service opencode-cmcc-deepxiv.service
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
