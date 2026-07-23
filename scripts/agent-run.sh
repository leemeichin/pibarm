#!/usr/bin/env bash
set -o pipefail

export PATH=$1
id=$2
log_path=$3
status_path=$4
node=$5
renderer=$6
shift 6

: >"$log_path"
code=143
finish() {
  printf '\n[agent %s exited %s]\n' "$id" "$code" | tee -a "$log_path"
  printf '%s\n' "$code" >"$status_path.$$.tmp"
  mv "$status_path.$$.tmp" "$status_path"
}
trap finish EXIT

printf '[agent %s started]\n' "$id" | tee -a "$log_path"
"$@" 2>&1 | "$node" "$renderer" | tee -a "$log_path"
code=${PIPESTATUS[0]}
exit "$code"
