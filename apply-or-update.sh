#!/usr/bin/env bash

commit=$1
osm_base_url=${OSM_BASE_URL:-http://localhost:3001}

if [[ "$commit" == "" ]]; then
  >&2 echo "Usage: apply-or-update.sh <commit>"
fi

set -uo pipefail

if [ ! -f .git/${commit}.json ]; then
  # create a new remote changeset
  >&2 echo "===> Creating a new changeset"
  git show -s --format=%B > changeset.xml
  changeset_id=$(curl -sfX PUT -d @changeset.xml -H "Content-Type: application/xml" ${osm_base_url}/api/0.6/changeset/create)

  # create an OSC from the current repo state
  git diff --name-status @^ | sort | node ../generate-osc.js -c $changeset_id -m map.json > changeset.osc 2> map.json

  >&2 echo "===> Uploading to changeset ${changeset_id}"
  curl -sX POST -d @changeset.osc -H "Content-Type: application/xml" ${osm_base_url}/api/0.6/changeset/${changeset_id}/upload -o response >&2

  file_type=$(file -b --mime-type response)

  # check the response; if it was XML, it was successful
  if [ "application/xml" != "$file_type" ]; then
    >&2 echo "Error:"
    >&2 cat response
    >&2 echo

    exit 1
  fi

  cat response >&2

  # stash the id remapping
  cat response | node ../handle-diffresult.js -m map.json > .git/${commit}.json

  # close the changeset
  >&2 echo "===> Closing changeset ${changeset_id}"
  curl -sfX PUT ${osm_base_url}/api/0.6/changeset/${changeset_id}/close

  echo "Changeset #${changeset_id}" > commit.message
  echo >> commit.message
  cat response >> commit.message

  # renumber nds and members
  node ../renumber.js -m .git/${commit}.json

  git add */

  git commit -F commit.message

  git clean -fdx

  # move the upstream tag now that it includes our data
  git tag -f upstream

  # tag it with the upstream changeset id
  git tag osm/${changeset_id}
else
  # already applied; renumber

  >&2 echo "===> git housekeeping"
  # added by us
  git status --porcelain | grep ^AU | cut -d " " -f 2 | xargs git add
  # added by them
  git status --porcelain | grep ^UA | cut -d " " -f 2 | xargs git add
  # deleted by both
  git status --porcelain | grep ^DD | cut -d " " -f 2 | xargs git rm

  >&2 echo "===> renumbering refs"
  node ../renumber.js -m .git/${commit}.json

  git add */

  git commit --amend -C @
fi
