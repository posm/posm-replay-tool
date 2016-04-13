```bash
$ node changeset-bbox.js changesets/*.xml
[-80.2516538,-3.5060679,-80.1927475,-3.4474499]
```


```bash
echo "(node($(node changeset-bbox.js changesets/*.xml | jq -r 'map(tostring) | [.[1], .[0], .[3], .[2]] | join(",")'));<;>>;>;);out meta;" > overpass.query
wget -O aoi.xml --post-file=overpass.query http://overpass-api.de/api/interpreter
osmconvert aoi.xml --out-pbf > aoi.pbf
```

Initialize a new repo w/ the current (remote) state, limited only to entities referred to by the changesets we're considering.

TODO blindly replace everything from the starting point w/ this so there's a common ancestor

```bash
node filter-by-use.js aoi.pbf aoi/ changesets/*.osc
```

Initialize a new repo w/ the branch point (starting point for POSM), limited only to entities referred to by the changesets we're considering.

```bash
node filter-by-use.js huaquillas-fixed.pbf posm/ changesets/*.osc
```

Apply all changesets to the local starting point:


```bash
node apply-osc.js changesets/37765184.osc posm/
cd posm/
git commit -F ../changesets/37765184.xml
cd ..
```
