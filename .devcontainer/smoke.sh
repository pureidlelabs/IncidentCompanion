#!/usr/bin/env bash
# Every tool the development container promises, answering from inside it.
#
# **A build that succeeds proves the image assembled, not that it works.** The
# tools arrive through mise's shims, on a PATH the image sets, installed by root
# into a system directory a non-root user has to be able to read -- and none of
# that is exercised by `docker build` finishing.
#
# The list is read from `mise.toml` rather than repeated here, so a tool added
# there is checked without this file changing. What is named below is what mise
# does *not* provide: the interpreter the image is built on, and the plugin
# `docker compose` resolves through.
set -euo pipefail

CONFIG="${MISE_GLOBAL_CONFIG_FILE:-/etc/mise/config.toml}"
[ -r "$CONFIG" ] || { echo "no mise config at $CONFIG" >&2; exit 1; }

# Tool names from the `[tools]` table: the key left of the first `=`.
mapfile -t TOOLS < <(sed -n '/^\[tools\]/,/^\[/p' "$CONFIG" \
  | grep -E '^[a-z0-9_-]+ *=' | cut -d= -f1 | tr -d ' ')

[ "${#TOOLS[@]}" -gt 0 ] || { echo "no tools declared in $CONFIG" >&2; exit 1; }

fail=0
check () {                      # name, command...
  local name="$1"; shift
  if out="$("$@" 2>&1 | head -1)"; then
    printf '  %-16s %s\n' "$name" "$out"
  else
    printf '  %-16s FAILED: %s\n' "$name" "$out"
    fail=1
  fi
}

echo "declared in $CONFIG: ${TOOLS[*]}"
echo

for tool in "${TOOLS[@]}"; do
  # The binary a tool installs is not always its name.
  case "$tool" in
    ripgrep)        bin=rg ;;
    docker-cli)     bin=docker ;;
    docker-compose) bin=docker-compose ;;
    node)           bin=node ;;
    *)              bin="$tool" ;;
  esac
  if ! command -v "$bin" >/dev/null 2>&1; then
    printf '  %-16s FAILED: %s is not on PATH\n' "$tool" "$bin"
    fail=1
    continue
  fi
  check "$tool" "$bin" --version
done

echo
# Not from mise, and each one silently absent is a container that builds.
check "npm" npm --version
check "python3" python3 --version
check "pip" pip --version
check "docker compose" docker compose version

# `docker compose` resolves through a plugin directory rather than PATH.
plugin=/usr/local/lib/docker/cli-plugins/docker-compose
[ -x "$plugin" ] || { echo "  compose plugin missing at $plugin"; fail=1; }

if [ "$fail" -ne 0 ]; then
  echo
  echo "the container built and is not usable" >&2
  exit 1
fi

echo
echo "every declared tool answers"
