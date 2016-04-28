#!/usr/bin/env bash

set -euo pipefail

# make sure we're on the applied branch (this should have been created beforehand)
git checkout applied

# loop through commits on the osm branch that don't exist upstream yet
git --no-pager log --reverse --format=%h upstream..osm | while read commit; do
  >&2 echo "===> cherry-picking ${commit}"

  # cherry-pick is allowed to fail (triggering resolution below)
  set +e

  # cherry-pick, preferring the local edits (-X theirs) containing ids that need to be rewritten
  git cherry-pick -X theirs $commit 2> /dev/null

  # re-enable failure on errors
  set -e

  if [ -f .git/CHERRY_PICK_HEAD ]; then
    >&2 echo "===> resolving conflicts automatically"

    # renumbering should bring remapped entities in line with expectations
    if [ -f .git/map.json ]; then
      >&2 echo "===> renumbering"
      node ../renumber.js -m .git/map.json

      git add */
    else
      >&2 echo "Can't resolve conflicts; no .git/map.json"
      exit 1
    fi

    >&2 echo "===> updating commit"

    # a new commit needs to be created when resolving cherry-pick conflicts (no commit has been
    # applied)
    git commit --allow-empty -C $commit
  else
    if [ -f .git/map.json ]; then
      >&2 echo "===> renumbering"
      node ../renumber.js -m .git/map.json

      git add */

      >&2 echo "===> updating commit"

      # the existing commit needs to be amended because it was already applied
      git commit --amend -C $commit
    fi
  fi

  >&2 echo "===> submitting ${commit}"

  ../submit.sh $commit
done
