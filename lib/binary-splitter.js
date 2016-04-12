"use strict";

const stream = require("stream"),
  util = require("util");

const buffertools = require("buffertools");

module.exports = class BinarySplitter extends stream.Transform {
  constructor(delimiter) {
    super();
    this.delimiter = delimiter || "\n";
    this.pending = new Buffer(0);
  }

  _transform(chunk, encoding, callback) {
    const buffer = Buffer.concat([this.pending, chunk]);
    let offset = 0;

    while (offset < buffer.length) {
      const idx = buffertools.indexOf(buffer, this.delimiter, offset);

      if (idx < 0) {
        break;
      }

      this.push(buffer.slice(offset, idx + 1));
      offset = idx + 1;
    }

    this.pending = buffer.slice(offset);

    return setImmediate(callback);
  }

  _flush(callback) {
    if (this.pending.length > 0) {
      this.push(this.pending);
    }

    return setImmediate(callback);
  }
};
