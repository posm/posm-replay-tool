"use strict";

var fs = require("fs"),
    path = require("path");

var xml2json = require("xml2json");

var xml = fs.readFileSync(path.join(process.cwd(), process.argv[2]), "utf8"),
    changeset = xml2json.toJson(xml, {
      object: true,
      reversible: true,
      arrayNotation: true,
    });

if (changeset.osmChange[0].modify) {
  (changeset.osmChange[0].modify[0].node || []).forEach(x => x.version--);
  (changeset.osmChange[0].modify[0].way || []).forEach(x => x.version--);
  (changeset.osmChange[0].modify[0].relation || []).forEach(x => x.version--);
}

console.log(xml2json.toXml(changeset));
