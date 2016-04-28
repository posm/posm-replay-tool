#!/usr/bin/env node

"use strict";

const execSync = require("child_process").execSync,
  fs = require("fs"),
  path = require("path"),
  stream = require("stream");

const async = require("async"),
  builder = require("xmlbuilder"),
  request = require("request"),
  xml2json = require("xml2json"),
  yaml = require("js-yaml"),
  yargs = require("yargs");

const BinarySplitter = require("./lib/binary-splitter");

const OSM_BASE_URL = process.env.OSM_BASE_URL || "http://localhost:3001";

const argv = yargs
  .usage("Usage: $0 [-c changeset_id] [-m id map]")
  .argv;

const placeholders = {
    nodes: {},
    ways: {},
    relations: {},
  },
  creates = [],
  modifies = [],
  deletes = [],
  changeset = argv.c || 0;

let placeholderId = -1,
  output = process.stderr;

if (argv.m) {
  output = fs.createWriteStream(path.resolve(argv.m));
}

const ENTITY_TYPES = {
  n: "nodes",
  w: "ways",
  r: "relations",
};

const OSM_ENTITY_TYPES = {
  nodes: "node",
  ways: "way",
  relations: "relation",
};

const renumber = entity => {
  if (entity.nds) {
    entity.nds = entity.nds.map(id => placeholders.nodes[id] || id);
  }

  if (entity.members) {
    entity.members = entity.members.map(member => {
      const type = ENTITY_TYPES[member.type];

      member.ref = placeholders[type][member.ref] || member.ref;

      return member;
    });
  }

  return entity;
};

// entityType is plural
const createFetcher = (entityType) => {
  return (tasks, next) => {
    const ids = tasks.map(x => x.id);

    return request.get({
      uri: OSM_BASE_URL + "/api/0.6/" + entityType,
      qs: {
        [entityType]: ids.join(","),
      }
    }, (err, rsp, xml) => {
      if (err) {
        return next(err);
      }

      const body = xml2json.toJson(xml, {
        arrayNotation: true, // ensure we get consistent results regardless of the number of results
        // returned
        object: true,
      });

      const versions = body.osm[0][OSM_ENTITY_TYPES[entityType]].reduce((obj, entity) => {
        obj[entity.id] = entity.version;

        return obj;
      }, {});

      tasks.forEach(x => {
        if (versions[x.id]) {
          return x.callback(null, versions[x.id]);
        }

        return x.callback(new Error("No version found for " + x.id));
      })

      return next();
    });
  };
};

const fetchers = {
  nodes: async.cargo(createFetcher("nodes"), 25),
  ways: async.cargo(createFetcher("ways"), 25),
  relations: async.cargo(createFetcher("relations"), 25),
};

// entityType is plural
const getVersion = (entityType, entityId, callback) => {
  return fetchers[entityType].push({
    id: entityId,
    callback
  });
}

const diffProcessor = new stream.Transform();
let pending = 0;

diffProcessor._transform = (line, _, callback) => {
  const parts = line.toString().trim().split("\t"),
    action = parts.shift(),
    filename = parts.shift(),
    entityType = path.dirname(filename),
    entityId = path.basename(filename, ".yaml");

  // ignore non-YAML files
  if (path.extname(filename) !== ".yaml") {
    return callback();
  }

  let entity;

  switch (action) {
  case "A":
    entity = yaml.safeLoad(fs.readFileSync(path.resolve(filename), "utf8"));

    placeholders[entityType][entityId] = placeholderId--;

    entity.type = OSM_ENTITY_TYPES[entityType];
    entity.id = placeholders[entityType][entityId];
    entity.version = 1;

    // renumber refs
    entity = renumber(entity);

    creates.push(entity);

    return callback();

  case "D":
    // read the version of the entity that was deleted
    entity = yaml.safeLoad(execSync(`git show @^:${filename}`));

    pending++;

    getVersion(entityType, entityId, (err, version) => {
      pending--;

      if (err) {
        return console.warn(err.stack);
      }

      deletes.push({
        id: entityId,
        type: OSM_ENTITY_TYPES[entityType],
        version: version,
      });
    });

    return callback();

  case "M":
    entity = yaml.safeLoad(fs.readFileSync(path.resolve(filename), "utf8"));

    entity.id = entityId;
    entity.type = OSM_ENTITY_TYPES[entityType];

    // renumber refs
    entity = renumber(entity);
    pending++;

    getVersion(entityType, entity.id, (err, version) => {
      pending--;

      if (err) {
        return console.warn(err.stack);
      }

      entity.version = version;

      modifies.push(entity);
    });

    return callback();

  default:
    return callback(new Error("Unsupported action: " + action));
  }
};

diffProcessor._flush = function(callback) {
  // wait for pending requests to complete
  return async.until(
    () => pending === 0,
    callback => setImmediate(callback),
    (err) => {
      if (err) {
        return callback(err);
      }

      this.push(`<osmChange version="0.6" generator="POSM Replay Tool">\n`);

      if (creates.length > 0) {
        this.push("<create>\n");

        // TODO this is the same as modify
        creates.forEach(entity => {
          let fragment = builder.create(entity.type);
          fragment.att("id", entity.id);
          fragment.att("version", entity.version);
          fragment.att("changeset", changeset);

          Object.keys(entity.tags || []).forEach(k => {
            fragment.ele("tag", {
              k,
              v: entity.tags[k],
            });
          });

          switch (entity.type) {
          case "node":
            fragment.att("lat", entity.lat);
            fragment.att("lon", entity.lon);

            break;

          case "way":
            (entity.nds || []).forEach(nd => {
              fragment.ele("nd", {
                ref: nd,
              });
            });

            break;

          case "relation":
            (entity.members || []).forEach(member => {
              fragment.ele("member", {
                type: OSM_ENTITY_TYPES[member.type],
                ref: member.ref,
                role: member.role,
              });
            });

            break;
          }

          this.push(fragment.toString({
            pretty: true
          }))
        });

        this.push("</create>\n");
      }

      if (modifies.length > 0) {
        this.push("<modify>\n");

        modifies.forEach(entity => {
          let fragment = builder.create(entity.type);
          fragment.att("id", entity.id);
          fragment.att("version", entity.version);
          fragment.att("changeset", changeset);

          Object.keys(entity.tags || []).forEach(k => {
            fragment.ele("tag", {
              k,
              v: entity.tags[k],
            });
          });

          switch (entity.type) {
          case "node":
            fragment.att("lat", entity.lat);
            fragment.att("lon", entity.lon);

            break;

          case "way":
            (entity.nds || []).forEach(nd => {
              fragment.ele("nd", {
                ref: nd,
              });
            });

            break;

          case "relation":
            (entity.members || []).forEach(member => {
              fragment.ele("member", {
                type: OSM_ENTITY_TYPES[member.type],
                ref: member.ref,
                role: member.role,
              });
            });

            break;
          }

          this.push(fragment.toString({
            pretty: true
          }))
        });

        this.push("</modify>\n");
      }

      if (deletes.length > 0) {
        this.push(`<delete if-unused="true">\n`);

        deletes.forEach(entity => {
          let fragment = builder.create(entity.type);
          fragment.att("id", entity.id);
          fragment.att("version", entity.version);
          fragment.att("changeset", changeset);

          this.push(fragment.toString({
            pretty: true
          }))
        });

        this.push("</delete>\n");
      }

      this.push("</osmChange>\n");

      const reverseMap = Object.keys(placeholders).reduce((obj, type) => {
        obj[type] = Object.keys(placeholders[type]).reduce((obj, originalId) => {
          obj[placeholders[type][originalId]] = originalId;

          return obj;
        }, {});

        return obj;
      }, {})

      output.write(JSON.stringify(reverseMap));

      return callback();
    }
  );
};

process.stdin.pipe(new BinarySplitter()).pipe(diffProcessor).pipe(process.stdout);
