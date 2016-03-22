#!/bin/bash

set -euo pipefail

osmosis --truncate-apidb database=openstreetmap validateSchemaVersion=no --rbf huaquillas-fixed.pbf --log-progress --write-apidb database=openstreetmap validateSchemaVersion=no
psql -d openstreetmap -c "select setval('changesets_id_seq', (select max(id) from changesets))"
psql -d openstreetmap -c "select setval('current_nodes_id_seq', (select max(node_id) from nodes))"
psql -d openstreetmap -c "select setval('current_ways_id_seq', (select max(way_id) from ways))"
psql -d openstreetmap -c "select setval('current_relations_id_seq', (select max(relation_id) from relations))"
psql -d openstreetmap -c "select setval('users_id_seq', (select max(id) from users))"
cd ../openstreetmap-website/ && bundle exec rake osm:users:create display_name='POSM' description='Portable OpenStreetMap' > /dev/null
