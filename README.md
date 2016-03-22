# Changeset Replay Tool

This tool collects changesets from an OSM API endpoint and replays then against
a different endpoint, rewriting IDs as objects are created.

## Steps

1. Choose a known starting point and generate XML corresponding to it. (AOI to start, but it's really about the MBR of all of the edits)
2. Add the XML to an empty git repository
3. Collect changesets from a running API
4. Write them into `changesets/<#>.osc`
5. Use `osmupdate` or Osmosis to apply each of the OSC files to the original XML
6. Stage the OSC
7. Commit the changes to the XML w/ changeset tags in the commit message
7. Voilà, commit history as a git repository

To replay:

1. Run `git rebase --exec <base revision>`
2. For each commit, submit the OSC (either present or generated from the diff
   between the current and previous XML representations) file to an OSM API
   using the changeset tags in the commit message
3. Apply the resulting OSC (potentially with different IDs) to the previous XML
   representation.
4. `git commit --amend`
5. `git rebase --continue` - ?? - will it correctly update changed ids?

To replay:

1. `git checkout master`
2. For each commit in `git cherry master | grep -v ^-` <- problematic because timestamp, version, and changeset cause `git patch-id` to change
1. `git log --reverse --format=%h`
3. `git checkout upstream`
4. `git merge <commit> -s recursive -X theirs`
4. `git cherry-pick -X theirs <commit>` <- merge strategy may be wrong, use patience instead
5. If it fails to resolve cleanly (check for `.git/CHERRY_PICK_HEAD`), `git cherry-pick --abort` and go to (1) (potentially branching and rebasing against the most recent successful commit, leaving (cherry-picking?) failed commits on a "failed" branch)
6. `foreach-commit.sh` (this will attempt to upload the changeset and will apply
   notes and tag it with the changeset id)
7. If it fails, `git reset --hard @~1` to drop the commit and go to (1) <- this is probably where cherry-picking failed commits makes sense (as it wasn't a local patch application problem)
8. Process the `DiffResult` and `rebase --exec` from `<commit>..pending` to
   rewrite IDs OR create a new commit and slip it in, hoping that subsequent ID usages will pick it up.
   Update the version as well. Ideally both will match, but they may not.
   Actually, applying the OSC fetched from OSM may effectively do this.
9. TODO rewrite the pending commit's title so that it can be filtered out: `git commit --amend -m "uploaded as $(git show -s --format=%h pending)" <commit>``
9. TODO or squash uploaded commits in the pending tree
10. Process the next commit

We can largely ignore the XML diffing problem (outlined [here](http://www.scribd.com/doc/14482474/XML-diff-survey)), since the data we're working with is always structured the same way. To help with diffs, we split out attributes per-line.

TODO query the API for each modified way to see if its current state (version) matches what's expected.

Rebase onto a different branch, `exec`ing each commit.

```
GIT_EDITOR=true git rebase -i -X ours --exec "/Users/seth/src/americanredcross/changeset-replay-tool/foreach-commit.sh" start
```

To get the commit message only:
git log --format=%B -n 1 [commit]
git show -s --format=%B [commit]

To make word diffs character:
--word-diff-regex=.

Attach notes with the response and appropriate debugging information (calculated
changeset, submitted changeset).

To test whether a patch will apply:

```
git show <commit> | git-apply --check -
```

Instead of rebasing, run through `git log` and attempt to apply each

```
git cherry-pick <commit>
```

Show changes left to apply:

```
[pending] git cherry uploaded
```

```
<osmChange version="0.6" generator="osmconvert 0.8.5"><create><way id="401684942" version="1" timestamp="2016-03-13T02:40:12Z" changeset="37765189"><nd ref="4054910999"></nd><nd ref="4054911000"></nd><nd ref="4054911001"></nd><nd ref="4054911002"></nd><nd ref="4054910999"></nd><tag k="leisure" v="park"></tag><tag k="name" v="Parky Park"></tag></way></create></osmChange>
===> Uploading to changeset 37765189
Error:
Precondition failed: Way  requires the nodes with id in (4054910999,4054911000,4054911001,4054911002), which either do not exist, or are not visible.
```

When testing:

* Create some new nodes + ways in the target database (or update the sequence)
  to ensure that IDs need to be rewritten

## Problematic Cases / Potential Conflicts

* Changeset ID offset
* Entity has been modified (has a different version number than expected) before being modified or deleted
* Entity's refs have been deleted
* Entity's refs were created locally (need to be re-numbered)

## Identifying Independent Commits

* Disconnected subgraphs

https://www.npmjs.com/package/dependency-graph -- Use entity IDs as dependencies (w:1234), checking whether they already exist (i.e. were modified during previous edits) before adding them.

Alternately, changesets depend on entities.

Inverted index of changesets by entity IDs. Use this to look up changeset order after determining entity ordering

```
psql -d openstreetmap -c "CREATE EXTENSION btree_gist"
psql -d openstreetmap -c "CREATE FUNCTION maptile_for_point(int8, int8, int4) RETURNS int4 AS '/opt/osm/osm-web/db/functions/libpgosm', 'maptile_for_point' LANGUAGE C STRICT"
psql -d openstreetmap -c "CREATE FUNCTION tile_for_point(int4, int4) RETURNS int8 AS '/opt/osm/osm-web/db/functions/libpgosm', 'tile_for_point' LANGUAGE C STRICT"
psql -d openstreetmap -c "CREATE FUNCTION xid_to_int4(xid) RETURNS int4 AS '/opt/osm/osm-web/db/functions/libpgosm', 'xid_to_int4' LANGUAGE C STRICT"


osmosis --truncate-apidb database=openstreetmap validateSchemaVersion=no --rbf huaquillas-fixed.pbf --log-progress --write-apidb database=openstreetmap validateSchemaVersion=no
psql -d openstreetmap -c "select setval('changesets_id_seq', (select max(id) from changesets))"
psql -d openstreetmap -c "select setval('current_nodes_id_seq', (select max(node_id) from nodes))"
psql -d openstreetmap -c "select setval('current_ways_id_seq', (select max(way_id) from ways))"
psql -d openstreetmap -c "select setval('current_relations_id_seq', (select max(relation_id) from relations))"
psql -d openstreetmap -c "select setval('users_id_seq', (select max(id) from users))"
bundle exec rake osm:users:create display_name='POSM' description='Portable OpenStreetMap'
```

## Optimizations

* Determine the bounding box for all edits and restrict the original XML to that
  area
* Generate an R-tree of edit bounding boxes and subdivide the files according to
  top-level bounding boxes - enable parallelism, reduce input size
