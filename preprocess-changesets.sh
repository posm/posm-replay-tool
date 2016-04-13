#/bin/bash

repo=${REPO:-work}
changeset_dir=${1}

if [ "" == "$changeset_dir" ]; then
  >&2 echo "Usage: preprocess-changesets.sh <changeset dir>"
  exit 1
fi

set -euo pipefail

find -E $changeset_dir -regex ".*[[:digit:]]+\.osc" | while read osc; do
  filename=$(basename $osc)
  changeset_id=${filename%%.osc}
  echo "===> Processing ${changeset_id}"

  node apply-osc.js $osc $repo

  pushd $repo
  git add .
  git commit --allow-empty -F ../${changeset_dir}/${changeset_id}.xml
  popd
done
