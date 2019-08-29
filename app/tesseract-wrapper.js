"use strict";
const path = require("path");
const child_process = require("child_process");
const helpers = require("./helpers");

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
  if(options.mimetype == "application/pdf") {
    return extractFromPdf(inFilePath, options);
  }
  if(supportedTypes.indexOf(options.mimetype) != -1) {
    return extractText(inFilePath, options);
  }
  else {
    throw new Error("Not an OCR-able Image");
  }
}

// Takes a PDF file, breaks it into page files, extracts text from each, removes intermediate files.
function extractFromPdf(inFilePath, options) {
  return new Promise((resolve,reject) => {
    const outFilePath = inFilePath + "-output.tiff";

    let outTiff = child_process.spawn("convert", [
      "-density", "300", // DPI
      "-background", "white",
      "-colorspace", "Gray", // Make it black and white.
      "-unsharp", "0x1",
      "+matte",
      inFilePath,
      outFilePath
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    var outTiffErr = [];
    outTiff.stderr.on('data', function(data) {
      outTiffErr.push(data);
    })

    outTiff.on("exit", (code) => {
      if (code !== 0) {
        helpers.deleteFile(outFilePath);
        return reject(new Error(Buffer.concat(outTiffErr).toString('utf-8')));
      }

      options.bot.logger.info("Generated TIFFs. Performing OCR.");
      return extractText(outFilePath).then((result) => {
        helpers.deleteFile(outFilePath);
        return resolve(result);
      });
    })
  })
}

// Takes the input file, returns a buffer full of text.
function extractText(inFilePath) {
  return new Promise((resolve,reject) => {
    let convert_child = child_process.spawn("tesseract", [
      path.resolve(inFilePath),
      "stdout",
      "-c", "include_page_breaks=1"
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