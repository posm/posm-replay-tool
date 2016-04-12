#/bin/bash

start=${1}
osm_base_url=${OSM_BASE_URL:-http://localhost:3000}

if [ "" == "$start" ]; then
  >&2 echo "Usage: gather_changesets.sh <starting point>"
  exit 1
fi

set -euo pipefail

changeset_id=$start

mkdir -p changesets/

# this will run until curl encounters an error (ideally a 404)
for ((changeset_id=$start; ; changeset_id++)); do
  echo "===> Gathering ${changeset_id}"
  curl -sf ${osm_base_url}/api/0.6/changeset/${changeset_id} -o changesets/${changeset_id}.xml
  curl -sf ${osm_base_url}/api/0.6/changeset/${changeset_id}/download -o changesets/${changeset_id}_osm.osc

  # rewrite the changesets into a form that osmconvert is happy with
  osmosis -q --read-xml-change changesets/${changeset_id}_osm.osc --sort-change --write-xml-change changesets/${changeset_id}.osc
done
