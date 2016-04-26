#!/usr/bin/env bash

osm_base_url=http://localhost:3001

# commits change, so we just want the first each time
while true; do
  ../rebase-one.sh
done
