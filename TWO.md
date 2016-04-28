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
    git mergetool -t opendiff -y --no-prompt

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

Submit each changeset

Make sure OSM API is running.
Make sure Postgres is running
Make sure environment vars are set appropriately
Make sure that the correct node version is in use
Make sure that `PATH` is correct (includes `git-merge-renumber`)

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
  GIT_EDITOR=true git rebase -i ${commit}^ --exec "OSM_BASE_URL=${osm_base_url} $(pwd)/../apply-or-update.sh ${commit}" -X theirs
  # GIT_EDITOR=true git rebase -i ${commit}^ --exec "OSM_BASE_URL=${osm_base_url} $(pwd)/../apply-or-update.sh ${commit}" --strategy renumber -X commit=${commit}

  # deal with merge conflicts
  # git rebase's --strategy isn't used because it still fails out even if it seemed to work
  while true; do
    if [ ! -d .git/rebase-merge ]; then
      >&2 echo "===> all done!"
      break
    fi

    >&2 echo "===> git housekeeping"

    git status --porcelain | grep ^AU | cut -d " " -f 2 | xargs git add
    # added by them
    git status --porcelain | grep ^UA | cut -d " " -f 2 | xargs git add
    # deleted by both
    git status --porcelain | grep ^DD | cut -d " " -f 2 | xargs git rm

    (git status --porcelain | grep -q ^UU) && git mergetool -y

    >&2 echo "===> renumbering refs (according to ${commit})"
    node ../renumber.js -m .git/${commit}.json

    git clean -f

    git add */

    git commit -C $(< .git/rebase-merge/stopped-sha)

    git rebase --continue
  done

  rm -f .git/${commit}.json
done
```

git-merge-renumber --commit=<commit>

> A merge strategy is a program that determines how two (or more) commits are merged. By default, git merge uses the "recursive" strategy, found in the program git-merge-recursive. By specifying the --strategy <strategy> flag to git-merge (or git-pull) you tell it to invoke a different strategy. If you want to plug in your own merge strategy, you can, by creating an executable git-merge-mystrategy in your path and running git merge --strategy mystrategy.

TODO when applying changesets, pretty print the XML using `tidy -q -xml -indent --indent-spaces 2 --indent-attributes yes -utf8`

Track applied changesets on their own branch.

```bash
cd posm/
git gc
git checkout -b applied upstream
git --no-pager log --reverse --format=%h upstream..osm | while read commit; do
  >&2 echo "===> cherry-picking ${commit}"

  # cherry-pick, preferring the local edits (with ids that need to be rewritten)
  git cherry-pick -X theirs $commit

  >&2 echo "===> poke away"
  # bash

  if [ -f .git/CHERRY_PICK_HEAD ]; then
    >&2 echo "===> git housekeeping"

    # TODO possibly not actually necessary
    # added by us
    git status --porcelain | grep ^AU | cut -d " " -f 2 | xargs git add
    # added by them
    git status --porcelain | grep ^UA | cut -d " " -f 2 | xargs git add
    # deleted by both
    git status --porcelain | grep ^DD | cut -d " " -f 2 | xargs git rm

    git clean -f

    if [ -f .git/map.json ]; then
      node ../renumber.js -m .git/map.json

      git add */
    fi

    # git add */

    git commit --allow-empty -C $commit
  fi

  >&2 echo "===> submitting ${commit}"

  ../submit.sh $commit

  git tag -f upstream $commit
done
```

TODO don't track actual placeholders (negative values)

Submit everything:

```bash
cd posm/
git checkout -b applied upstream
../submit-all.sh
```

To track the number of pending changesets, count the number of commits between the `upstream` marker and the tip of the `osm` branch:

```bash
watch "git --no-pager log --reverse --format=%h upstream..osm | wc -l"
```
