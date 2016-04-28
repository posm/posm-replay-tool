# Changeset Replay Tool

This tool collects changesets from an OSM API endpoint and replays them against
a different endpoint, rewriting IDs as objects are created.

## Steps

1. Obtain an AOI extract (PBF or XML) corresponding to the point where the local OSM API branched
   from. (This should be the same file that was used to instantiate your local APIDB.)
2. Gather local changesets.
3. Initialize a git repository containing locally-modified entities present in the AOI extract.
4. Obtain an AOI extract containing current data from your _upstream_ (presumably
   openstreetmap.org).
5. Extract and apply changes to locally-modified entities from the _current_ AOI extract.
6. Create a branch representing the local history by applying all local changesets to a branch
   containing the _starting_ AOI extract.
7. Apply each local changeset to the branch containing the _current_ AOI extract.
8. Manually resolve merge conflicts between local and upstream edits.
9. Submit resolved changesets to your _upstream_ API, renumbering references to locally-created
   entities as necessary.

## Steps (in Detail)

### 1. Obtain AOI Extract at Branch Point

You should already have a copy of this file.

### 2. Gather Local Changesets

Determine the first local changeset. Assuming you have access to the local APIDB:

```bash
psql -d osm_posm -t -c "select id from changesets where num_changes > 0 order by id asc limit 1"
```

Gather changesets from the local OSM API into `changesets/`:

```bash
OSM_BASE_URL=http://localhost:3000 ./gather_changesets.sh <first changeset id>
```

### 3. Initialize the git Repository from the Branch Point

Filter the AOI extract according to entities referenced in local changesets:

```bash
node filter-by-use.js huaquillas-fixed.pbf posm/ changesets/*.osc
cd posm/
git init
git add .
git commit -m "Branch point"
git tag start
git gc
cd ..
```

### 4. Obtain a Current AOI Extract

Calculate the bounding box for all local changesets and fetch the corresponding area from Overpass,
converting to PBF for good measure:

```bash
echo "(node($(node changeset-bbox.js changesets/*.xml | jq -r 'map(tostring) | [.[1], .[0], .[3], .[2]] | join(",")'));<;>>;>;);out meta;" > overpass.query
wget -O aoi.xml --post-file=overpass.query http://overpass-api.de/api/interpreter
osmconvert aoi.xml --out-pbf > aoi.pbf
```

### 5. Extract and Apply Upstream Changes

Filter the AOI extract according to entities referenced in local changesets and apply to a new
branch. This ensures that there's a common ancestor when moving commits between branches.

```bash
cd posm/
rm -rf *
cd ..

node filter-by-use.js aoi.pbf posm/ changesets/*.osc
cd posm/
git add .
git checkout -b osm
git commit -m "Current OSM"
git tag upstream
git gc
cd ..
```

### 6. Apply Local Changesets to the Branch Point

This is effectively what has already occurred through editing using the OSM API, although doing it
in `git` terms allows us to more easily move changes between branches.

```bash
cd posm/
git checkout master
cd ..

REPO=posm ./preprocess-changesets.sh changesets/

cd posm/
git gc
cd ..
```

### 7-8. Apply Local Changesets to the Upstream Version and Resolve Conflicts

Walk through all local changesets and apply them to the upstream branch. This will open your
configured `git` mergetool (`opendiff` / FileMerge on OS X), allowing you to resolve conflicts
manually.

TODO extract this into a script

```bash
cd posm/
git checkout osm
git tag marker start
git --no-pager log --reverse --format=%h marker..master | while read sha1; do
  git cherry-pick $sha1

  echo Applying $sha1

  if [ -f .git/CHERRY_PICK_HEAD ]; then
    # remove files that were deleted by us (as we no longer refer to them and
    # will submit the deletions as "if-unused")
    git status --porcelain | grep ^UD | cut -d " " -f 2 | xargs git rm

    # remove files that were deleted upstream
    git status --porcelain | grep ^DU | cut -d " " -f 2 | xargs git rm

    # data available to the mergetool:
    #  * OSM version
    #  * our version
    #  * current version of OSM refs (via API) -- (we don't know the version ref'd)
    #  * current version of our refs (via API, if POSM is available) -- (we don't know the version ref'd)

    # In other words, we can show node movements, tag and ref/membership changes
    # but not way/relation composition (visually)
    # TODO sometimes this fails, in which case marker will have already been set to $sha1
    git mergetool -y --no-prompt

    git clean -f

    git add */

    git commit --allow-empty -C $sha1
  fi

  # remove temporary files
  git clean -f

  # update the marker
  git tag -f marker $sha1
done
```

### 9. Submit Resolved Changesets Upstream

Create a new branch for changesets that have been applied upstream and walk through all local
changesets, submitting them and renumbering (remapping entity IDs and references) as necessary.

```bash
cd posm/
git checkout -b applied upstream
../submit-all.sh
```

ID remapping information will be left behind in `.git/map.json` (cumulative) and `.git/<commit>.json` (per-changeset).

To track the number of pending changesets, count the number of commits between the `upstream` marker and the tip of the `osm` branch:

```bash
watch "git --no-pager log --reverse --format=%h upstream..osm | wc -l"
```

## Tools

### `apply-osc.js`

### `changeset-bbox.js`

### `filter-by-use.js`

### `generate-osc.js`

### `handle-diffresult.js`

### `preprocess-changesets.sh`

### `remap-userid.sh`

### `renumber.js`

### `submit-all.sh`

### `submit.sh`

---

## Old Notes Follow

## Identifying Independent Commits

* Disconnected subgraphs

https://www.npmjs.com/package/dependency-graph -- Use entity IDs as dependencies (w:1234), checking whether they already exist (i.e. were modified during previous edits) before adding them.

Alternately, changesets depend on entities.

Inverted index of changesets by entity IDs. Use this to look up changeset order after determining entity ordering

## Current Problems

* Ensure that changeset IDs are rewritten and a clean set of changesets apply
* Ensure that local "merge conflicts" don't occur
* Rewrite entity IDs after creating new elements (increase the sequence value)
* Raise conflicts/confirmations on nth (2+) node movements (OR prefer local changes with the assumption that they represent ground truthing)
* Determine whether ^^ applies to ways (it would if we were using the OSCs, but since we're generating OSCs from the diff, the diff will have been updated with whatever tag + ref changes made during a previous resolution)

## Future Problems

* Pre-emptive conflict detection (by querying the API for entities referred to in a given changeset)
* Working set size reduction (R-Tree filtering of input AOI)
* Moving nodes locally + remotely. 1 remote move, 2+ local moves. First will raise a conflict, subsequent local moves won't.
  * Keep a sorted list (as a file or a prefixed tree, possibly containing some state) containing the IDs of entities that have been touched (and a separate one for conflicts and a separate one for conflicts resolved in favor of upstream edits). If a changeset touches anything in the conflicted list, mark it as conflicted.
  * nth edits are conflicts IF the previous version of the entity in question was resolved in favor of upstream. If it was resolved in favor of the local version, it's not a conflict.

  * Look at the previous state (lat/lng/nds/members/tags) of the node (via `xpath` against the full XML) and compare it to the upstream version. This will indicate how the conflict was resolved (but only for ours/theirs, not a merge).

## Conflict resolution

1. Update the version number of the entity that's conflicting (accept local)
2. Drop the entity that's conflicting from the OSC (accept remote). ADD TO CONFLICT LIST as "remote"
3. Update the version number AND body of the entity that's conflicting (merge). ADD TO CONFLICT LIST as "merged"

(Version numbers don't need to be updated because they will automatically increment because we're generating OSC from XML diffs.)

## Other Approaches

Pull changesets for the matching bounding box and apply them to the upstream branch before starting. May need to paginate if more than 100 changesets appear.

This approach allows us to merge each commit on `master` against `upstream` (locally) to identify + resolve merge conflicts. Once that's been done, `upstream` can be "rebased" against the remote API, applying each commit (vs. submitting each commit at merge-time).

OR

Fetch the same extract from Overpass, which will have all of the changesets applied (and we don't care about the content of individual changesets)

```
echo "(node(-3.515306,-80.259418,-3.447453,-80.184231);<;>>;>;);out meta;" > huaquillas.overpass
wget -O huaquillas-201603301217.xml --post-file=huaquillas.overpass http://overpass-api.de/api/interpreter
```


xsltproc --stringparam pattern //changeset/@id --stringparam value . whatever.xslt remote_changesets.xml

`fetch-remote-changesets.sh <bbox>`
`apply-remote-changesets.sh <directory>`



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
