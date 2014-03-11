'use strict';


var fs    = require('fs');
var path  = require('path');
var _     = require('lodash');
var async = require('async');

var pako_utils = require('../lib/zlib/utils');
var pako  = require('../index');

// Load fixtures to test
// return: { 'filename1': content1, 'filename2': content2, ...}
//
function loadSamples() {
  var result = {};
  var dir = path.join(__dirname, 'fixtures');

  fs.readdirSync(dir).sort().forEach(function (sample) {
    var filepath = path.join(dir, sample),
        extname  = path.extname(filepath),
        basename = path.basename(filepath, extname),
        content  = new Uint8Array(fs.readFileSync(filepath));

    if (basename[0] === '_') { return; } // skip files with name, started with dash

    result[basename] = content;
  });

  return result;
}


// Compare 2 buffers (can be Array, Uint8Array, Buffer).
//
function cmpBuf(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  for (var i=0, l=a.length; i<l; i++) {
    if (a[i] !== b[i]) {
      //console.log('pos: ' +i+ ' - ' + a[i].toString(16) + '/' + b[i].toString(16));
      return false;
    }
  }

  return true;
}


// Helper to test deflate/deflateRaw with different options.
// Use zlib streams, because it's the only way to define options.
//
function testDeflateSingle(zlib_factory, pako_deflate, data, options, callback) {

  var zlib_options = _.clone(options);

  // hack for testing negative windowBits
  if (zlib_options.windowBits < 0) { zlib_options.windowBits = -zlib_options.windowBits; }

  var zlibStream = zlib_factory(zlib_options);
  var buffers = [], nread = 0;


  zlibStream.on('error', function(err) {
    zlibStream.removeAllListeners();
    zlibStream=null;
    callback(err);
  });

  zlibStream.on('data', function(chunk) {
    buffers.push(chunk);
    nread += chunk.length;
  });

  zlibStream.on('end', function() {
    zlibStream.removeAllListeners();
    zlibStream=null;

    var buffer = Buffer.concat(buffers);

    var pako_result = pako_deflate(data, options);

    if (!cmpBuf(buffer, pako_result)) {
      callback(new Error('zlib result != pako result'));
      return;
    }

    callback(null);
  });


  zlibStream.write(new Buffer(data));
  zlibStream.end();
}

function testDeflate(zlib_factory, pako_deflate, samples, options, callback) {
  var queue = [];

  _.forEach(samples, function(data, name) {
    // with untyped arrays
    queue.push(function (done) {
      pako_utils.forceUntyped = true;

      testDeflateSingle(zlib_factory, pako_deflate, data, options, function (err) {
        if (err) {
          done('Error in "' + name + '" - zlib result != pako result');
          return;
        }
        done();
      });
    });

    // with typed arrays
    queue.push(function (done) {
      pako_utils.forceUntyped = false;

      testDeflateSingle(zlib_factory, pako_deflate, data, options, function (err) {
        if (err) {
          done('Error in "' + name + '" - zlib result != pako result');
          return;
        }
        done();
      });
    });
  });

  async.series(queue, callback);
}


function testInflate(samples, options, callback) {
  var name, data, deflated, inflated;

  for (name in samples) {
    data = samples[name];
    deflated = pako.deflate(data, options);

    // with untyped arrays
    pako_utils.forceUntyped = true;
    inflated = pako.inflate(deflated, options);
    pako_utils.forceUntyped = false;

    if (!cmpBuf(inflated, data)) {
      callback('Error in "' + name + '" - inflate result != original');
      return;
    }

    // with typed arrays
    inflated = pako.inflate(deflated, options);

    if (!cmpBuf(inflated, data)) {
      callback('Error in "' + name + '" - inflate result != original');
      return;
    }
  }

  callback();
}


exports.cmpBuf = cmpBuf;
exports.testDeflate = testDeflate;
exports.testInflate = testInflate;
exports.loadSamples = loadSamples;