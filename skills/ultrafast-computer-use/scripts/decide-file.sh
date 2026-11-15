#!/bin/zsh

set -eu

request_file="${1:-}"
if [[ -z "$request_file" ]]; then
  print -r -- '{"version":"jev-computer-use.response.v1","ok":false,"error":{"code":"usage","message":"request file is required"}}'
  exit 64
fi

cleanup() {
  rm -- "$request_file" 2>/dev/null || true
}
trap cleanup EXIT

# Preserve explicit caller routing across the machine-local Jev configuration.
# A local-only choice must not be overwritten with a remote provider.
typeset -A caller_routing
for routing_name in ULTRAFAST_PRIMARY_PROVIDER ULTRAFAST_SECONDARY_PROVIDER ULTRAFAST_FAILBACK_PROVIDER; do
  if (( ${+parameters[$routing_name]} )); then
    caller_routing[$routing_name]="${(P)routing_name}"
  fi
done

# Keep the optional remote Jev credential in a separate 0600 file. The file is
# sourced only for this decision process and is never part of the repository.
jev_env_file="${ULTRAFAST_JEV_ENV_FILE:-${HOME}/.config/ultrafast/jev.env}"
if [[ -r "$jev_env_file" ]]; then
  source "$jev_env_file"
fi

for routing_name in "${(@k)caller_routing}"; do
  export "${routing_name}=${caller_routing[$routing_name]}"
done

script_dir="${0:A:h}"
repo_dir="${script_dir}/../../.."
if [[ ! -f "${repo_dir}/dist/cli.js" ]]; then
  npm --prefix "$repo_dir" run build --silent >&2
fi

node "${repo_dir}/dist/cli.js" decide-file "$request_file"
