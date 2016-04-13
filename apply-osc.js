#!/usr/bin/env node

"use strict";

const fs = require("fs"),
  path = require("path");

const mkdirp = require("mkdirp"),
  osmium = require("osmium"),
  yaml = require("js-yaml");

if (process.argv[3] == null) {
  console.warn("Usage: filter-by-use.js <OsmChange> <output directory>");
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
    user: node.user,
    uid: node.uid,
    visible: node.visible,
    // TODO do we care about the changeset?
    // it throws conflicts w/o being useful, but knowing which changeset was the
    // source of a given revision could be valuable
    changeset: node.changeset,
    version: node.version,
    id: node.id,
    tags: node.tags(),
  };

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
    user: way.user,
    uid: way.uid,
    visible: way.visible,
    changeset: way.changeset,
    version: way.version,
    id: way.id,
    tags: way.tags(),
    nds: way.node_refs(),
  };

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
    user: relation.user,
    uid: relation.uid,
    visible: relation.visible,
    changeset: relation.changeset,
    version: relation.version,
    id: relation.id,
    tags: relation.tags(),
    members: relation.members(),
  };

  mkdirp.sync(path.dirname(basename));

  fs.writeFileSync(basename + ".tsv", yaml.safeDump(obj, {
    sortKeys: true
  }), "utf8");
});

osmium.apply(reader, handler);
