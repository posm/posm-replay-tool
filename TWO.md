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
node filter-by-use.js aoi.pbf posm/ changesets/*.osc
cd posm/
git add .
git checkout -b osm
git commit -m "Current OSM"
git tag upstream
cd ..
```

Apply all changesets to the local starting point:

```bash
cd posm/
git checkout master
cd ..
REPO=posm ./preprocess-changesets.sh changesets/
```

Apply changesets one-by-one to the `osm` branch.

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
    git mergetool -t opendiff --no-prompt

    git commit --allow-empty -C $sha1
  fi

  # remove temporary files
  git clean -fdx

  # update the marker
  git tag -f marker $sha1
done
```

Submit each changeset

```bash
cd posm/
git checkout osm
osm_base_url=http://localhost:3001

# commits change, so we just want the first each time
while true; do
  commit=$(git --no-pager log --reverse --format=%h upstream..osm | head -1)

  if [[ "$commit" == ""]]; then
    break
  fi

  # seems to need to be an absolute path
  # TODO if a commit can't be applied, it stops. running the command by hand works, so maybe it can be a merge strategy / whatever (git-merge-test)
  # TODO node ids must remain strings
  GIT_EDITOR=true git rebase -i ${commit}^ --exec "OSM_BASE_URL=${osm_base_url} $(pwd)/../apply-or-update.sh ${commit}"

  rm -f .git/${commit}.json
done
```
