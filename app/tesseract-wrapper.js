"use strict";
const path = require("path");
const child_process = require("child_process");

module.exports = {
  extract
}

const supportedTypes = [
  "image/png",
  "image/bmp",
  "image/gif",
  "image/tiff",
  "image/jpeg",
]

// Options:
//   mime: string (The MIME type of the input data.)
// Returns a promise that has a buffer with PNG image data.
function extract(inFilePath, options = {}) {
  if(!options.mimetype) options.mimetype = "application/octet-stream";

  // Either extract raw, or convert to TIFFs (if it's a pdf) and then extract.
  if(supportedTypes.indexOf(options.mimetype) != -1) {
    return extractText(inFilePath, options)
  }
  else {
    throw new Error("Not an OCR-able Image")
  }
}

// Returns a buffer.
function extractText(inFilePath) {
  return new Promise((resolve,reject) => {
    let convert_child = child_process.spawn("tesseract", [
      path.resolve(inFilePath),
      "stdout"
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    var stderr = [];
    convert_child.stderr.on('data', function(data) {
      stderr.push(data);
    })
    
    var stdout = [];
    convert_child.stdout.on('data', function (data) {
      stdout.push(data);
    });

    convert_child.on('exit', function (code) {
      if (code !== 0) {
        return reject(new Error(Buffer.concat(stderr).toString('utf-8')));
      }

      resolve(Buffer.concat(stdout));
    });
  })
}