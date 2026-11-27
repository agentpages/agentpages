#!/usr/bin/env bash
set -euo pipefail

pin=spec/upstream.json
repository=$(jq -r .repository "$pin")
path=$(jq -r .path "$pin")
pinned=$(jq -r .blobSha "$pin")
current=$(gh api "repos/$repository/contents/$path" --jq .sha)

if [ "$current" != "$pinned" ]; then
  echo "$repository/$path changed: pinned $pinned, now $current."
  echo "Review the upstream diff against spec/agentpages.md, then update $pin."
  exit 1
fi
