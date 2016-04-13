#!/usr/bin/env node

"use strict";

const fs = require("fs"),
  path = require("path");

const mkdirp = require("mkdirp"),
  osmium = require("osmium"),
  yaml = require("js-yaml");

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
    tags: node.tags(),
  };

  mkdirp.sync(path.resolve(path.join(target, "nodes")));

  fs.writeFileSync(path.resolve(path.join(target, "nodes", node.id + ".yaml")),
    yaml.safeDump(obj, {
      sortKeys: true
    }),
    "utf8");
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
    tags: way.tags(),
    nds: way.node_refs(),
  };

  mkdirp.sync(path.resolve(path.join(target, "ways")));

  fs.writeFileSync(path.resolve(path.join(target, "ways", way.id + ".yaml")),
    yaml.safeDump(obj, {
      sortKeys: true
    }),
    "utf8");
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
    tags: relation.tags(),
    members: relation.members(),
  };

  mkdirp.sync(path.resolve(path.join(target, "relations")));

  fs.writeFileSync(path.resolve(path.join(target, "relations", relation.id + ".yaml")),
    yaml.safeDump(obj, {
      sortKeys: true
    }),
    "utf8");
});

osmium.apply(reader, handler);
