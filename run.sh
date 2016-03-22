#!/bin/bash

set -euo pipefail

# scratch=$(mktemp -d -t tmp.XXXXXXXXXX)
# function finish {
#   rm -rf work/
# }
# trap finish EXIT

extract=huaquillas-fixed.pbf
start=37765184
repo=work

mkdir -p work/
pushd work
git init
popd

echo "===> Generating XML"
osmconvert $extract | tidy -q -xml -indent --indent-spaces 2 --indent-attributes yes -utf8 - > work/data.osm

pushd work
git add data.osm
git commit -m "Source point"
git tag start
git tag accepted
popd

# echo "===> Gathering changesets"
# ./gather_changesets.sh $start

for ((changeset_id=$start; ; changeset_id++)); do
  test -f changesets/${changeset_id}.osc || break

  echo "===> Processing ${changeset_id}"

  osmconvert work/data.osm changesets/${changeset_id}.osc | tidy -q -xml -indent --indent-spaces 2 --indent-attributes yes -utf8 - > work/${changeset_id}.osm
  mv work/${changeset_id}.osm work/data.osm

  pushd work
  git commit -aF ../changesets/${changeset_id}.xml
  popd
done

echo "===> Applying changes"

# pushd work
# git filter-branch --tree-filter "/Users/seth/src/americanredcross/changeset-replay-tool/foreach-commit.sh"
# popd

echo "===> Done"
