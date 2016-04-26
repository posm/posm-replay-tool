#!/usr/bin/env bash

commit=$(git --no-pager log --reverse --format=%h upstream..osm | head -1)
osm_base_url=${OSM_BASE_URL:-http://localhost:3001}

if [[ "$commit" == "" ]]; then
  break
fi

# seems to need to be an absolute path
# TODO if a commit can't be applied, it stops. running the command by hand works, so maybe it can be a merge strategy / whatever (git-merge-test)
GIT_EDITOR=true git rebase -i ${commit}^ --exec "OSM_BASE_URL=${osm_base_url} $(pwd)/../apply-or-update.sh ${commit}" -X theirs
# GIT_EDITOR=true git rebase -i ${commit}^ --exec "OSM_BASE_URL=${osm_base_url} $(pwd)/../apply-or-update.sh ${commit}" --strategy renumber -X commit=${commit}

while true; do
  if [ ! -d .git/rebase-merge ]; then
    >&2 echo "===> done rebasing ${commit}"
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
