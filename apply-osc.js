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
  const filename = path.resolve(path.join(target, "nodes", node.id + ".yaml"));

  if (node.visible === false) {
    // delete
    fs.unlinkSync(filename);

    return;
  }

  const obj = {
    lat: node.lat,
    lon: node.lon,
    uid: node.uid,
    user: node.user,
  };

  const tags = node.tags();

  if (Object.keys(tags).length > 0) {
    obj.tags = tags;
  }

  mkdirp.sync(path.resolve(path.dirname(filename)));

  fs.writeFileSync(filename, yaml.safeDump(obj, {
    sortKeys: true
  }), "utf8");
});

handler.on("way", way => {
  const filename = path.resolve(path.join(target, "ways", way.id + ".yaml"));

  if (way.visible === false) {
    // delete
    fs.unlinkSync(filename);

    return;
  }

  const obj = {
    uid: way.uid,
    user: way.user,
    nds: way.node_refs(),
  };

  const tags = way.tags();

  if (Object.keys(tags).length > 0) {
    obj.tags = tags;
  }

  mkdirp.sync(path.dirname(filename));

  fs.writeFileSync(filename, yaml.safeDump(obj, {
    sortKeys: true
  }), "utf8");
});

handler.on("relation", relation => {
  const filename = path.resolve(path.join(target, "relations", relation.id + ".yaml"));

  if (relation.visible === false) {
    // delete
    fs.unlinkSync(filename);

    return;
  }

  const obj = {
    uid: relation.uid,
    user: relation.user,
    members: relation.members(),
  };

  const tags = relation.tags();

  if (Object.keys(tags).length > 0) {
    obj.tags = tags;
  }

  mkdirp.sync(path.dirname(filename));

  fs.writeFileSync(filename, yaml.safeDump(obj, {
    sortKeys: true
  }), "utf8");
});

osmium.apply(reader, handler);
