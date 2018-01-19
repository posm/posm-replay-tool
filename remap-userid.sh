#!/usr/bin/env bash

set -eo pipefail

if [[ "$1" == "" && "$2" == "" ]]; then
  >&2 echo "Usage: remap-userid.sh <uid> <user>"
  exit 1
fi

sed=$(which sed)
# use gsed if available
type gsed > /dev/null && sed=$(which gsed)

$sed -re "s/uid=\"$1\" user=\"[^"]+\"/uid=\"$1\" user=\"$2\"/"
