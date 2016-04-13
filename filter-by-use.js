#!/usr/bin/env node

"use strict";

const fs = require("fs"),
  path = require("path");

const mkdirp = require("mkdirp"),
  osmium = require("osmium");

if (process.argv[4] == null) {
  console.warn("Usage: filter-by-use.js <extract> <output directory> <OSMChange> [OSMChange...]");
  return process.exit(1);
}

const extract = process.argv[2],
  target = process.argv[3],
  changes = process.argv.slice(4);

const refs = new Set(),
  added = new Set();

let deletes = 0,
  adds = 0,
  modifies = 0;

changes.forEach(f => {
  const reader = new osmium.Reader(path.resolve(f));

  let buffer;
  while ((buffer = reader.read())) {
    let object;

    while ((object = buffer.next())) {
      switch (true) {
      case object.visible === false:
        deletes++;
        refs.add(object.id);
        break;

      case object.version === 1:
        adds++;
        added.add(object.id);
        break;

      default:
        modifies++;

        if (!added.has(object.id)) {
          refs.add(object.id);
        }
      }
    }
  }
});

console.log("Adds: %d", adds);
console.log("Modifies: %d", modifies);
console.log("Deletes: %d", deletes);

console.log("Extract:", extract);

const reader = new osmium.Reader(path.resolve(extract)),
  handler = new osmium.Handler();

handler.on("node", node => {
  if (!refs.has(node.id)) {
    return;
  }

  const obj = {
    lat: node.lat,
    lon: node.lon,
    user: node.user,
    uid: node.uid,
    visible: node.visible,
    changeset: node.changeset,
    version: node.version,
    id: node.id,
  };

  mkdirp.sync(path.resolve(path.join(target, "nodes")));

  const tsv = Object.keys(obj).sort().reduce((tsv, k) => {
    return tsv + [k, obj[k]].join("\t") + "\n";
  }, "");

  fs.writeFileSync(path.resolve(path.join(target, "nodes", node.id + ".tsv")),
    tsv,
    "utf8");

  const tags = node.tags(),
    tagTsv = Object.keys(tags).sort().reduce((tsv, k) => {
      return tsv + [k, tags[k]].join("\t") + "\n";
    }, "");

  if (tagTsv.length > 0) {
    fs.writeFileSync(path.resolve(path.join(target, "nodes", node.id + ".tags.tsv")),
      tagTsv,
      "utf8");
  }
});

handler.on("way", way => {
  if (!refs.has(way.id)) {
    return;
  }

  const obj = {
    user: way.user,
    uid: way.uid,
    visible: way.visible,
    changeset: way.changeset,
    version: way.version,
    id: way.id,
  };

  mkdirp.sync(path.resolve(path.join(target, "ways")));

  const tsv = Object.keys(obj).sort().reduce((tsv, k) => {
    return tsv + [k, obj[k]].join("\t") + "\n";
  }, "");

  fs.writeFileSync(path.resolve(path.join(target, "ways", way.id + ".tsv")),
    tsv,
    "utf8");

  const tags = way.tags(),
    tagTsv = Object.keys(tags).sort().reduce((tsv, k) => {
      return tsv + [k, tags[k]].join("\t") + "\n";
    }, "");

  if (tagTsv.length > 0) {
    fs.writeFileSync(path.resolve(path.join(target, "ways", way.id + ".tags.tsv")),
      tagTsv,
      "utf8");
  }

  if (way.nodes_count > 0) {
    fs.writeFileSync(path.resolve(path.join(target, "ways", way.id + ".nds")),
      way.node_refs().join("\n"),
      "utf8");
  }
});

handler.on("relation", relation => {
  if (!refs.has(relation.id)) {
    return;
  }

  const obj = {
    user: relation.user,
    uid: relation.uid,
    visible: relation.visible,
    changeset: relation.changeset,
    version: relation.version,
    id: relation.id,
  };

  mkdirp.sync(path.resolve(path.join(target, "relations")));

  const tsv = Object.keys(obj).sort().reduce((tsv, k) => {
    return tsv + [k, obj[k]].join("\t") + "\n";
  }, "");

  fs.writeFileSync(path.resolve(path.join(target, "relations", relation.id + ".tsv")),
    tsv,
    "utf8");

  const tags = relation.tags(),
    tagTsv = Object.keys(tags).sort().reduce((tsv, k) => {
      return tsv + [k, tags[k]].join("\t") + "\n";
    }, "");

  if (tagTsv.length > 0) {
    fs.writeFileSync(path.resolve(path.join(target, "relations", relation.id + ".tags.tsv")),
      tagTsv,
      "utf8");
  }

  if (relation.members_count > 0) {
    fs.writeFileSync(path.resolve(path.join(target, "relations", relation.id + ".members")),
      relation.members().map(m => [m.type, m.ref, m.role].join("\t")).join("\n"),
      "utf8");
  }
});

osmium.apply(reader, handler);
