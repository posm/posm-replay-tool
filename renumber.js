#!/usr/bin/env node

"use strict";

const fs = require("fs"),
  path = require("path");

const yaml = require("js-yaml"),
  yargs = require("yargs");

const ENTITY_TYPES = {
  n: "nodes",
  w: "ways",
  r: "relations",
};

const argv = yargs
    .usage("Usage: $0 [-m id map]")
    .demand("m")
    .argv,
  placeholders = JSON.parse(fs.readFileSync(path.resolve(argv.m), "utf8"));

const nodeIds = Object.keys(placeholders.nodes).map(Number);

try {
  fs.readdirSync(path.resolve("ways")).forEach(filename => {
    const entityPath = path.resolve(path.join("ways", filename)),
      entity = yaml.safeLoad(fs.readFileSync(entityPath));

    if (entity.nds.some(nd => nodeIds.indexOf(nd) >= 0)) {
      console.warn("%s has nds that need to be rewritten");

      entity.nds = entity.nds.map(nd => placeholder.nodes[nd] || nd);

      fs.writeFileSync(entityPath, yaml.safeDump(entity), "utf8");
    }
  });
} catch (err) {
  if (err.code !== "ENOENT") {
    console.warn(err.stack);
  }
}

try {
  fs.readdirSync(path.resolve("relations")).forEach(filename => {
    const entityPath = path.resolve(path.join("relations", filename)),
      entity = yaml.safeLoad(fs.readFileSync(entityPath));

    if (entity.members.some(member => nodeIds.indexOf(member.ref) >= 0)) {
      console.warn("%s has members that need to be rewritten");

      entity.members = entity.members.map(member => {
        return {
          type: member.type,
          ref: placeholder[ENTITY_TYPES[member.type]][member.ref] || member.ref,
          role: member.role,
        };
      });

      fs.writeFileSync(entityPath, yaml.safeDump(entity), "utf8");
    }
  });
} catch (err) {
  if (err.code !== "ENOENT") {
    console.warn(err.stack);
  }
}
