#/bin/bash

start=${1}
source_osm_base_url=${SOURCE_OSM_BASE_URL:-http://localhost:3000}

if [ "" == "$start" ]; then
  >&2 echo "Usage: $0 <starting point>"
  exit 1
fi

set -euo pipefail

changeset_id=$start

mkdir -p changesets/

# this will run until curl encounters an error (ideally a 404)
for ((changeset_id=$start; ; changeset_id++)); do
  >&2 echo "===> Gathering ${changeset_id}"

  curl -sf ${source_osm_base_url}/api/0.6/changeset/${changeset_id} | \
    tidy -q \
      -xml \
      -indent \
      --indent-spaces 2 \
      --indent-attributes yes \
      -utf8 > changesets/${changeset_id}.xml
  curl -sf ${source_osm_base_url}/api/0.6/changeset/${changeset_id}/download \
    -o changesets/${changeset_id}.orig

  # rewrite the changesets into a form that osmconvert is happy with
  osmosis -q \
    --read-xml-change changesets/${changeset_id}.orig \
    --sort-change \
    --write-xml-change changesets/${changeset_id}.osc
done

# delete the final changeset (which would have 404'd)
rm -f changesets/${changeset_id}.xml
