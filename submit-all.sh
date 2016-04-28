#!/usr/bin/env bash

set -e

OSM_BASE_URL=http://localhost:3001

# git checkout -b applied upstream

# make sure we're on the applied branch (this should have been created separately)
git checkout applied
git --no-pager log --reverse --format=%h upstream..osm | while read commit; do
  >&2 echo "===> cherry-picking ${commit}"

  # cherry-pick is allowed to fail (triggering resolution below)
  set +e
  # cherry-pick, preferring the local edits (with ids that need to be rewritten)
  git cherry-pick -X theirs $commit >> ../submit.log 2> /dev/null
  set -e

  if [ -f .git/CHERRY_PICK_HEAD ]; then
    >&2 echo "===> resolving conflicts automatically"

    # TODO possibly not actually necessary
    # added by us
    git status --porcelain | grep ^AU | cut -d " " -f 2 | xargs git add
    # added by them
    git status --porcelain | grep ^UA | cut -d " " -f 2 | xargs git add
    # deleted by both
    git status --porcelain | grep ^DD | cut -d " " -f 2 | xargs git rm

    git clean -f >> ../submit.log

    if [ -f .git/map.json ]; then
      >&2 echo "===> renumbering"
      node ../renumber.js -m .git/map.json >> ../submit.log

      git add */
    fi

    >&2 echo "===> updating commit"
    git commit --allow-empty -C $commit >> ../submit.log
  else
    if [ -f .git/map.json ]; then
      >&2 echo "===> renumbering"
      node ../renumber.js -m .git/map.json >> ../submit.log

      git add */

      >&2 echo "===> updating commit"
      git commit --amend -C $commit >> ../submit.log
    fi
  fi

  >&2 echo "===> submitting ${commit}"

  ../submit.sh $commit

  git tag -f upstream $commit
done

# fa1827a is problematic
