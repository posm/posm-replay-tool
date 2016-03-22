#!/bin/bash

# NOTE: this can't be called with a relative path from git filter-branch, as the
# current directory won't be what you expect

osm_base_url=${OSM_BASE_URL:-http://localhost:3000}

set -euo pipefail

# pull the previous version
git show @^:data.osm > parent.osm
# generate a changeset
osmconvert --diff parent.osm data.osm > changeset.osc

# cat changeset.xml >&2
# cat changeset.osc >&2

# add if-unused=whatever in <delete> blocks to prevent nodes that have started
# to be used from being deleted
sed -E -e "s/<delete/<delete if-unused=\"whatever\"/" -i '' changeset.osc

# drop the bounds tag
sed -E -e 's/<bounds .*\/>//' -i '' changeset.osc

# create a new remote changeset
>&2 echo "===> Creating a new changeset"
git show -s --format=%B > changeset.xml
changeset_id=$(curl -sfX PUT -d @changeset.xml -H "Content-Type: application/xml" ${osm_base_url}/api/0.6/changeset/create)

# set all changeset attributes to the new changeset's id
sed -E -e "s/changeset=\".+\"/changeset=\"${changeset_id}\"/" -i '' changeset.osc

# decrement version numbers
# TODO do other changeset mangling in this script
# TODO use xmllint --format to pretty-print this
# TODO need a pretty printer that puts each attribute on its own line
# tidy -xml -indent --indent-spaces 2 --indent-attributes yes -utf8 data.osm
node /Users/seth/src/americanredcross/changeset-replay-tool/decrement-versions.js changeset.osc > new_changeset.osc
mv new_changeset.osc changeset.osc

cat changeset.osc >&2

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

# close the changeset
>&2 echo "===> Closing changeset ${changeset_id}"
curl -sfX PUT ${osm_base_url}/api/0.6/changeset/${changeset_id}/close

# fetch the remote version of the changeset
>&2 echo "===> Fetching remote version of ${changeset_id}"
curl -sf ${osm_base_url}/api/0.6/changeset/${changeset_id}/download -o osm_changeset.osc

# rewrite the changesets into a form that osmconvert is happy with
>&2 echo "===> Sorting remote changeset"
osmosis -q --read-xml-change osm_changeset.osc --sort-change --write-xml-change remote_changeset.osc

# apply the rewritten changeset to the previous version of the data
>&2 echo "===> Applying remote changeset locally"
osmconvert parent.osm remote_changeset.osc | tidy -q -xml -indent --indent-spaces 2 --indent-attributes yes -utf8 - > data.osm

# commit + tag
git add data.osm
git commit --amend --no-edit
git tag osm/changeset/$changeset_id

# apply notes
git notes append -F changeset.osc
git notes append -F response
git notes append -F osm_changeset.osc
git notes append -F remote_changeset.osc

# clean up
rm parent.osm changeset.osc osm_changeset.osc remote_changeset.osc response changeset.xml

# move the marker tag
git tag -f accepted

# this will work for the first one, but the changes to data.osm need to flow forward before it can be done again
