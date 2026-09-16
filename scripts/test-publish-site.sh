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
[ -s "$PICFORGE_DEPLOY_ROOT/$first/index.html" ]
# A third successful activation keeps only itself and the previously active release.
mkdir "$PICFORGE_DEPLOY_ROOT/releases/notes"
ln -s "$test_root" "$PICFORGE_DEPLOY_ROOT/releases/1111111111111111111111111111111111111111-0-0"
publish "$source_dir" 2-1
[ "$(readlink "$PICFORGE_DEPLOY_ROOT/html")" = "releases/$sha-2-1" ]
[ ! -e "$PICFORGE_DEPLOY_ROOT/$first" ]
[ -s "$PICFORGE_DEPLOY_ROOT/$second/index.html" ]
[ "$(find "$PICFORGE_DEPLOY_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -name "$sha-*" | wc -l)" -eq 2 ]
[ -d "$PICFORGE_DEPLOY_ROOT/releases/notes" ]
[ -L "$PICFORGE_DEPLOY_ROOT/releases/1111111111111111111111111111111111111111-0-0" ]
# A real html directory must never be replaced.
export PICFORGE_DEPLOY_ROOT="$test_root/existing"
mkdir -p "$PICFORGE_DEPLOY_ROOT/html"
if publish "$source_dir" 4-0; then exit 1; fi
[ -d "$PICFORGE_DEPLOY_ROOT/html" ] && [ ! -L "$PICFORGE_DEPLOY_ROOT/html" ]
echo 'Atomic publish checks passed'
