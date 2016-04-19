#!/usr/bin/env node

"use strict";

const fs = require("fs"),
  path = require("path");

const mkdirp = require("mkdirp"),
  osmium = require("osmium"),
  yaml = require("js-yaml");

if (process.argv[3] == null) {
  console.warn("Usage: apply-osc.js <OsmChange> <output directory>");
  return process.exit(1);
}

const osc = process.argv[2],
  target = process.argv[3],
  reader = new osmium.Reader(path.resolve(osc)),
  handler = new osmium.Handler();

handler.on("node", node => {
  const basename = path.resolve(path.join(target, "nodes", node.id.toString()));

  if (node.visible === false) {
    // delete
    fs.unlinkSync(basename + ".yaml");

    return;
  }

  const obj = {
    lat: node.lat,
    lon: node.lon,
    uid: node.uid,
    version: node.version,
    id: node.id,
  };

  const tags = node.tags();

  if (Object.keys(tags).length > 0) {
    obj.tags = tags;
  }

  mkdirp.sync(path.resolve(path.dirname(basename)));

  fs.writeFileSync(basename + ".yaml", yaml.safeDump(obj, {
    sortKeys: true
  }), "utf8");
});

handler.on("way", way => {
  const basename = path.resolve(path.join(target, "ways", way.id.toString()));

  if (way.visible === false) {
    // delete
    fs.unlinkSync(basename + ".yaml");

    return;
  }

  const obj = {
    uid: way.uid,
    version: way.version,
    id: way.id,
    nds: way.node_refs(),
  };

  const tags = way.tags();

  if (Object.keys(tags).length > 0) {
    obj.tags = tags;
  }

  mkdirp.sync(path.dirname(basename));

  fs.writeFileSync(basename + ".yaml", yaml.safeDump(obj, {
    sortKeys: true
  }), "utf8");
});

handler.on("relation", relation => {
  const basename = path.resolve(path.join(target, "relations", relation.id.toString()));

  if (relation.visible === false) {
    // delete
    fs.unlinkSync(basename + ".yaml");

    return;
  }

  const obj = {
    uid: relation.uid,
    version: relation.version,
    id: relation.id,
    members: relation.members(),
  };

  const tags = relation.tags();

  if (Object.keys(tags).length > 0) {
    obj.tags = tags;
  }

  mkdirp.sync(path.dirname(basename));

  fs.writeFileSync(basename + ".yaml", yaml.safeDump(obj, {
    sortKeys: true
  }), "utf8");
});

osmium.apply(reader, handler);
