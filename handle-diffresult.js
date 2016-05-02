#!/usr/bin/env node

"use strict";

const fs = require("fs"),
  path = require("path");

const sax = require("sax"),
  yaml = require("js-yaml"),
  yargs = require("yargs");

// squelch EPIPE errors
require("epipebomb")();

const argv = yargs
  .usage("Usage: $0 [-m id map]")
  .argv;

let placeholders = {
  nodes: {},
  ways: {},
  relations: {},
};

if (argv.m) {
  placeholders = JSON.parse(fs.readFileSync(path.resolve(argv.m), "utf8"));
}

const saxStream = sax.createStream(false, {
  lowercase: true,
});

saxStream.on("opentag", node => {
  if (["node", "way", "relation"].indexOf(node.name) < 0) {
    return;
  }

  // pluralize entity type (to match the ID map)
  const type = node.name + "s",
    dstPath = path.resolve(path.join(type, node.attributes.new_id + ".yaml"));

  if (node.attributes.old_id !== node.attributes.new_id && node.attributes.new_id != null) {
    // rename (deletes should have been handled separately)
    const originalId = placeholders[type][node.attributes.old_id] || node.attributes.old_id,
      newId = node.attributes.new_id,
      srcPath = path.resolve(path.join(type, originalId + ".yaml"));

    // update the placeholder map to point to minted ids
    placeholders[type][originalId] = newId;

    // delete negative placeholders
    if (node.attributes.old_id < 0) {
      delete placeholders[type][node.attributes.old_id];
    }

    if (originalId !== newId) {
      // TODO use debug
      // console.warn("%d → %s", originalId, newId);
      try {
        fs.linkSync(srcPath, dstPath);
        fs.unlinkSync(srcPath);
      } catch (err) {
        console.warn(err.stack);
      }
    }
  }
});

saxStream.on("end", () => {
  process.stdout.write(JSON.stringify(placeholders));
});

process.stdin.pipe(saxStream);
