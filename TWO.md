```bash
$ node changeset-bbox.js changesets/*.xml
[-80.2516538,-3.5060679,-80.1927475,-3.4474499]
```


```bash
echo "(node($(node changeset-bbox.js changesets/*.xml | jq -r 'map(tostring) | [.[1], .[0], .[3], .[2]] | join(",")'));<;>>;>;);out meta;" > overpass.query
wget -O aoi.xml --post-file=overpass.query http://overpass-api.de/api/interpreter
osmconvert aoi.xml --out-pbf > aoi.pbf
```

Initialize a new repo w/ the branch point (starting point for POSM), limited only to entities referred to by the changesets we're considering.

```bash
node filter-by-use.js huaquillas-fixed.pbf posm/ changesets/*.osc
cd posm/
git init
git add .
git commit -m "Branch point"
git tag start
cd ..
```

Initialize a new repo w/ the current (remote) state, limited only to entities referred to by the changesets we're considering.

TODO blindly replace everything from the starting point w/ this so there's a common ancestor

```bash
cd posm/
rm -rf *
cd ..
node filter-by-use.js aoi.pbf aoi/ changesets/*.osc
cd posm/
git add .
git checkout -b osm
git commit -m "Current OSM"
cd ..
```


Apply all changesets to the local starting point:

```bash
REPO=posm ./preprocess-changesets.sh changesets/
```

Apply changesets one-by-one to the `osm` branch.

```bash
cd posm/
git checkout osm
git tag marker start
git --no-pager log --reverse --format=%h marker..master | while read sha1; do
  git cherry-pick $sha1

  if [ -f .git/CHERRY_PICK_HEAD ]; then
    # remove files that were deleted by us (as we no longer refer to them and
    # will submit the deletions as "if-unused")
    git status --porcelain | grep ^UD | cut -d " " -f 2 | xargs git rm

    # data available to the mergetool:
    #  * OSM version
    #  * our version
    #  * current version of OSM refs (via API) -- (we don't know the version ref'd)
    #  * current version of our refs (via API, if POSM is available) -- (we don't know the version ref'd)

    # In other words, we can show node movements, tag and ref/membership changes
    # but not way/relation composition (visually)
    git mergetool

    git commit --allow-empty -C $sha1
  fi

  # remove temporary files
  git clean -fdx

  # update the marker
  git tag -f marker $sha1
done
```
