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
    .argv;

try {
  const stats = fs.statSync(path.resolve(argv.m));

  if (stats.size === 0) {
    console.warn("Placeholder map is empty; skipping.");
    process.exit(0);
  }
} catch (err) {
  console.warn("Placeholder map does not exist; skipping.");
  process.exit(0);
}

// load placeholders w/ an empty object as a fallback
const placeholders = JSON.parse(fs.readFileSync(path.resolve(argv.m), "utf8"));

placeholders.nodes = placeholders.nodes || {};
placeholders.ways = placeholders.ways || {};
placeholders.relations = placeholders.relations || {};

// rename files if necessary
["nodes", "ways", "relations"].forEach(entityType => {
  Object.keys(placeholders[entityType]).forEach(oldId => {
    const newId = placeholders[entityType][oldId],
      srcPath = path.resolve(path.join(entityType, oldId + ".yaml")),
      dstPath = path.resolve(path.join(entityType, newId + ".yaml"));

    try {
      // verify that the source file exists
      fs.accessSync(srcPath);

      // delete the target (if it exists)
      try {
        fs.unlinkSync(dstPath);
      } catch (err) {
        // target file (probably) doesn't exist
        if (err.code !== "ENOENT") {
          console.warn(err.stack);
        }
      }

      // link the source to the target
      fs.linkSync(srcPath, dstPath);

      // delete the source
      fs.unlinkSync(srcPath);
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.warn(err.stack);
      }
    }
  });
});

// gather ids to check whether remapping is necessary
const nodeIds = Object.keys(placeholders.nodes).map(Number),
  wayIds = Object.keys(placeholders.ways).map(Number),
  relationIds = Object.keys(placeholders.relations).map(Number);

console.warn("Tracking %d remapped ids", nodeIds.length + wayIds.length + relationIds.length);

let ways = [],
  relations = [];

try {
  ways = fs.readdirSync(path.resolve("ways"))
    .filter(filename => path.extname(filename) === ".yaml");
} catch (err) {
  if (err.code !== "ENOENT") {
    console.warn(err.stack);
  }
}

try {
  relations = fs.readdirSync(path.resolve("relations"))
    .filter(filename => path.extname(filename) === ".yaml");
} catch (err) {
  if (err.code !== "ENOENT") {
    console.warn(err.stack);
  }
}

console.warn("Checking %d ways", ways.length);
console.warn("Checking %d relations", relations.length);

async.eachLimit(ways, 50, (filename, next) => {
  const entityPath = path.resolve(path.join("ways", filename));

  return fs.readFile(entityPath, (err, data) => {
    if (err) {
      return next(err);
    }

    try {
      const entity = yaml.safeLoad(data);

      if (entity.nds.some(nd => nodeIds.indexOf(nd) >= 0)) {
        console.warn("%s has nds that need to be rewritten", filename);

        entity.nds = entity.nds.map(nd => Number(placeholders.nodes[nd]) || nd);

        return fs.writeFile(entityPath, yaml.safeDump(entity), "utf8", next);
      }

      return next();
    } catch (err) {
      console.log("Error handling %s", filename);
      return next(err);
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

    if (entity.members.some(member => member.type === "n" && nodeIds.indexOf(member.ref) >= 0) ||
        entity.members.some(member => member.type === "w" && wayIds.indexOf(member.ref) >= 0) ||
        entity.members.some(member => member.type === "r" && relationIds.indexOf(member.ref) >= 0)) {
      console.warn("%s has members that need to be rewritten", filename);

      entity.members = entity.members.map(member => {
        return {
          type: member.type,
          ref: Number(placeholders[ENTITY_TYPES[member.type]][member.ref]) || member.ref,
          role: member.role,
        };
      });

      return fs.writeFile(entityPath, yaml.safeDump(entity), "utf8", next);
    }

    return next();
  })
}, err => {
  if (err) {
    throw err;
  }
});
