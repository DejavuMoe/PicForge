#!/bin/sh
set -eu
source_dir=$(realpath "${1:?pass verified dist directory}")
test_root=$(mktemp -d)
trap 'rm -rf -- "$test_root"' EXIT
export PICFORGE_DEPLOY_ROOT="$test_root/site"
mkdir "$PICFORGE_DEPLOY_ROOT"
sha=0000000000000000000000000000000000000000
publish() { sh scripts/publish-site.sh "$1" "$sha-$2"; }
publish "$source_dir" 1-0
first=$(readlink "$PICFORGE_DEPLOY_ROOT/html")
publish "$source_dir" 2-0
second=$(readlink "$PICFORGE_DEPLOY_ROOT/html")
[ "$first" != "$second" ]
[ -s "$PICFORGE_DEPLOY_ROOT/$first/index.html" ]
publish "$source_dir" 1-1
[ "$(readlink "$PICFORGE_DEPLOY_ROOT/html")" = "$second" ]
cp -R "$source_dir" "$test_root/broken"
printf 'corrupted' >> "$test_root/broken/index.html"
if publish "$test_root/broken" 3-0; then exit 1; fi
[ "$(readlink "$PICFORGE_DEPLOY_ROOT/html")" = "$second" ]
# A real html directory must never be replaced.
export PICFORGE_DEPLOY_ROOT="$test_root/existing"
mkdir -p "$PICFORGE_DEPLOY_ROOT/html"
if publish "$source_dir" 4-0; then exit 1; fi
[ -d "$PICFORGE_DEPLOY_ROOT/html" ] && [ ! -L "$PICFORGE_DEPLOY_ROOT/html" ]
echo 'Atomic publish checks passed'
