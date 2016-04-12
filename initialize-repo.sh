#!/bin/sh

repo=${REPO:-work}
extract=$1

if [[ "$1" == "" ]]; then
  >&2 echo "Usage: initialize-repo.sh <starting point>"
  exit 1
fi

set -euo pipefail

mkdir -p $repo/
pushd $repo
git init
popd

echo "===> Generating XML"
osmconvert $extract | tidy -q -xml -indent --indent-spaces 2 --indent-attributes yes -utf8 - > $repo/data.osm

pushd $repo
git add data.osm
git commit -m "Starting point"
git tag start
popd
