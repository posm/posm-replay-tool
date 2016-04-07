const fs = require("fs"),
  path = require("path");

const xml2json = require("xml2json");

if (process.argv[2] == null) {
  console.warn("Usage: osc-bbox.js <OSC>");
  return process.exit(1);
}

const xml = fs.readFileSync(path.resolve(process.argv[2]), "utf8"),
  changeset = xml2json.toJson(xml, {
    object: true,
    arrayNotation: true,
  });

const bbox = changeset.osmChange.reduce((bbox, osmChange) => {
  // TODO deletes don't include useful lat/lon values
  return ["create", "modify"].reduce((bbox, action) => {
    return (osmChange[action] || []).reduce((bbox, action) => {
      // TODO we can't resolve refs, so we can only use nodes to determine bbox
      return ["node"].reduce((bbox, type) => {
        return (action[type] || []).reduce((bbox, node) => {
          bbox[0] = Math.min(bbox[0] || node.lon, node.lon);
          bbox[1] = Math.min(bbox[1] || node.lat, node.lat);
          bbox[2] = Math.max(bbox[2] || node.lon, node.lon);
          bbox[3] = Math.max(bbox[3] || node.lat, node.lat);

          return bbox;
        }, bbox);
      }, bbox);
    }, bbox);
  }, bbox)
}, []);

console.log("%j", bbox);
