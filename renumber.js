#!/usr/bin/env node

"use strict";

const fs = require("fs"),
  path = require("path");

const async = require("async"),
  yaml = require("js-yaml"),
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
  // load placeholders w/ an empty object as a fallback
  placeholders = JSON.parse(fs.readFileSync(path.resolve(argv.m), "utf8") || "{}");

placeholders.nodes = placeholders.nodes || {};
placeholders.ways = placeholders.ways || {};
placeholders.relations = placeholders.relations || {};

const nodeIds = Object.keys(placeholders.nodes).map(Number);

let ways,
  relations;

try {
  ways = fs.readdirSync(path.resolve("ways"));
} catch (err) {
  if (err.code !== "ENOENT") {
    console.warn(err.stack);
  }
}

try {
  relations = fs.readdirSync(path.resolve("relations"));
} catch (err) {
  if (err.code !== "ENOENT") {
    console.warn(err.stack);
  }
}

async.eachLimit(ways, 50, (filename, next) => {
  const entityPath = path.resolve(path.join("ways", filename));

  return fs.readFile(entityPath, (err, data) => {
    if (err) {
      return next(err);
    }

    const entity = yaml.safeLoad(data);

    if (entity.nds.some(nd => nodeIds.indexOf(nd) >= 0)) {
      console.warn("%s has nds that need to be rewritten", entityPath);

      entity.nds = entity.nds.map(nd => placeholders.nodes[nd] || nd);

      return fs.writeFile(entityPath, yaml.safeDump(entity), "utf8", next);
    }
  });
}, err => {
  if (err) {
    throw err;
  }
});

async.eachLimit(relations, 50, (filename, next) => {
  const entityPath = path.resolve(path.join("relations", filename));

  return fs.readFile(entityPath, (err, data) => {
    if (err) {
      return next(err);
    }

    const entity = yaml.safeLoad(data);

    if (entity.members.some(member => nodeIds.indexOf(member.ref) >= 0)) {
      console.warn("%s has members that need to be rewritten", entityPath);

      entity.members = entity.members.map(member => {
        return {
          type: member.type,
          ref: placeholders[ENTITY_TYPES[member.type]][member.ref] || member.ref,
          role: member.role,
        };
      });

      return fs.writeFile(entityPath, yaml.safeDump(entity), "utf8", next);
    }
  })
}, err => {
  if (err) {
    throw err;
  }
});
