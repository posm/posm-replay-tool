```bash
$ node changeset-bbox.js changesets/*.xml
[-80.2516538,-3.5060679,-80.1927475,-3.4474499]
```


```bash
echo "(node($(node changeset-bbox.js changesets/*.xml | jq -r 'map(tostring) | [.[1], .[0], .[3], .[2]] | join(",")'));<;>>;>;);out meta;" > overpass.query
wget -O aoi.xml --post-file=overpass.query http://overpass-api.de/api/interpreter
osmconvert aoi.xml --out-pbf > aoi.pbf
```
