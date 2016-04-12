#/bin/bash

repo=${REPO:-work}
changeset_dir=${1}

if [ "" == "$changeset_dir" ]; then
  >&2 echo "Usage: preprocess-changesets.sh <changeset dir>"
  exit 1
fi

set -uo pipefail

find -E $changeset_dir -regex ".*[[:digit:]]+\.osc" | while read osc; do
  filename=$(basename $osc)
  changeset_id=${filename%%.osc}
  echo "===> Processing ${changeset_id}"

  osmconvert $repo/data.osm $osc | tidy -q -xml -indent --indent-spaces 2 --indent-attributes yes -utf8 - > $repo/${changeset_id}.osm
  mv $repo/${changeset_id}.osm $repo/data.osm

  pushd $repo
  git commit -aF ../${changeset_dir}/${changeset_id}.xml
  popd
done
