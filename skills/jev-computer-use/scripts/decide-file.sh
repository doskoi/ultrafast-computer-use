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

script_dir="${0:A:h}"
repo_dir="${script_dir}/../../.."
if [[ ! -f "${repo_dir}/dist/cli.js" ]]; then
  npm --prefix "$repo_dir" run build --silent >&2
fi

node "${repo_dir}/dist/cli.js" decide-file "$request_file"
