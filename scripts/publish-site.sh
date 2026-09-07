#!/bin/sh
set -eu

source_dir=$(realpath "${1:?usage: publish-site.sh SITE_DIR RELEASE_ID}")
release_id=${2:?missing release id}
# Woodpecker can leave CI_PIPELINE_RERUNS empty on the first run.
case "$release_id" in *-) release_id="${release_id}0" ;; esac
printf '%s\n' "$release_id" | grep -Eq '^[0-9a-f]{40}-[0-9]+-[0-9]+$' || exit 64
site=${PICFORGE_DEPLOY_ROOT:-/deploy}
case "$site" in /*) ;; *) exit 64 ;; esac
[ "$site" != / ] && [ -d "$site" ] && [ ! -L "$site" ] || exit 66
site=$(realpath "$site")

verify() {
  [ -s "$1/index.html" ] && [ -s "$1/SHA256SUMS" ] || return 1
  (cd "$1" && sha256sum --check --strict --status SHA256SUMS)
}
verify "$source_dir"
[ ! -L "$site/releases" ] || exit 66
mkdir -p "$site/releases"
exec 9>"$site/.deploy.lock"
flock -x -w 900 9

live="$site/html"
if [ -L "$live" ]; then
  current=$(readlink "$live")
  printf '%s\n' "$current" | grep -Eq '^releases/[0-9a-f]{40}-[0-9]+-[0-9]+$' || exit 67
  [ -s "$live/index.html" ] || exit 67
  current_numbers=${current#*-}
  incoming_numbers=${release_id#*-}
  if [ "${incoming_numbers%-*}" -lt "${current_numbers%-*}" ] || {
    [ "${incoming_numbers%-*}" -eq "${current_numbers%-*}" ] &&
    [ "${incoming_numbers##*-}" -le "${current_numbers##*-}" ];
  }; then
    echo "Skipping stale release: $release_id"
    exit 0
  fi
elif [ -e "$live" ]; then
  echo "Refusing to replace existing non-symlink: $live" >&2
  exit 67
fi

candidate="$site/releases/$release_id"
next="$site/.next-$release_id"
[ ! -e "$candidate" ] && [ ! -L "$candidate" ] || exit 73
[ ! -e "$next" ] && [ ! -L "$next" ] || exit 73
# Keep failed candidates for inspection; never remove an active or previous release.
trap 'rm -f -- "$next"' EXIT
trap 'exit 1' HUP INT TERM
mkdir -m 0755 "$candidate"
cp -R "$source_dir"/. "$candidate"/
find "$candidate" -type d -exec chmod 0755 {} +
find "$candidate" -type f -exec chmod 0644 {} +
verify "$candidate"
ln -s "releases/$release_id" "$next"
verify "$next"
# Relative link resolves on both the container and host; rename is on one filesystem.
mv -Tf -- "$next" "$live"
echo "Activated picforge.de: $release_id"
