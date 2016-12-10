#!/usr/bin/env node

"use strict";

const path = require("path");

const osmium = require("osmium");

// squelch EPIPE errors
require("epipebomb")();

if (process.argv[2] == null) {
  console.warn("Usage: changeset-bbox.js <changeset> [changeset...]");
  return process.exit(1);
}

/**
 * Determine the minimum bounding rectangle for a collection of OSM changeset
 * XML.
 */
const bbox = process.argv.slice(2).reduce((bbox, f) => {
  try {
    const reader = new osmium.Reader(path.resolve(f));

    let buffer;
    while ((buffer = reader.read())) {
      let changeset;

      while ((changeset = buffer.next())) {
        if (changeset.bounds) {
          const bounds = changeset.bounds;

          bbox[0] = Math.min(bbox[0] || Infinity, bounds.left());
          bbox[1] = Math.min(bbox[1] || Infinity, bounds.bottom());
          bbox[2] = Math.max(bbox[2] || -Infinity, bounds.right());
          bbox[3] = Math.max(bbox[3] || -Infinity, bounds.top());
        }
      }
    }

    return bbox;  

  } catch (e) {
    console.error('No bbox found in: ' + f);
    return bbox;
  }
  
}, []);

console.log("%j", bbox);
