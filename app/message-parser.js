"use strict";
const queryBuilder = require('./queryBuilder');
const RabbitClient = require('@menome/botframework/rabbitmq');
const truncate = require("truncate-utf8-bytes");
const helpers = require('./helpers');
const twrapper = require('./tesseract-wrapper');
const natural = require("natural")

module.exports = function(bot) {
  var outQueue = new RabbitClient(bot.config.get('rabbit'));
  outQueue.connect();

  // First ingestion point.
  this.handleMessage = function(msg) {
    var tmpPath = "/tmp/"+msg.Uuid;
    return processMessage(msg).then((resultStr) => {
      var newRoute = helpers.getNextRoutingKey(resultStr, bot);

      if(newRoute === false || newRoute === undefined) {
        helpers.deleteFile(tmpPath);
        return bot.logger.info("No next routing key.");
      }

      if(typeof newRoute === "string") {
        bot.logger.info("Next routing key is '%s'", newRoute)
        return outQueue.publishMessage(msg, "fileProcessingMessage", {routingKey: newRoute});
      }
      else if(Array.isArray(newRoute)) {
        bot.logger.info("Next routing keys are '%s'", newRoute.join(', '))
        newRoute.forEach((rkey) => {
          return outQueue.publishMessage(msg, "fileProcessingMessage", {routingKey: rkey});
        })
      }
    }).catch((err) => {
      bot.logger.error("Error Processing:", err)
      helpers.deleteFile(tmpPath);
    })
  }

  //////////////////////////////
  // Internal/Helper functions

  function processMessage(msg) {
    var mimetype = msg.Mime;
    if(!mimetype) mimetype = "application/octet-stream";
    var tmpPath = "/tmp/"+msg.Uuid;

    return helpers.getFile(bot, msg.Library, msg.Path, tmpPath).then((tmpPath) => {
      return ocr(mimetype, tmpPath).then(async (extracted) => {
        let pageTextQuery = false;
        let fulltext = extracted;
        if(Array.isArray(extracted)) {
          // Do processing for other metadata. Correct spelling ratio and stuff.
          let trimmedArray = [];
          let wordCountArray = [];
          let correctSpellingRatioArray = [];

          extracted.forEach((textBlock, idx) => {
            let tokenizer = new natural.WordTokenizer();
            let tokens = tokenizer.tokenize(textBlock);
            wordCountArray[idx] = tokens.length;
            correctSpellingRatioArray[idx] = helpers.spellCheckList(tokens) / wordCountArray[idx]

            trimmedArray[idx] = helpers.removeStopWordsFromArray(natural.LancasterStemmer.tokenizeAndStem(textBlock)).join(" ")
            if(textBlock === false) return;
            if(textBlock.trim() === "") {
              return "empty-"+mimetype;
            }
          })

          pageTextQuery = queryBuilder.fulltextPageQuery({uuid: msg.Uuid, pageTextArray: fulltext, trimmedArray, wordCountArray, correctSpellingRatioArray});
          fulltext = truncate(extracted.join(" "), 30000);
          await bot.neo4j.query(pageTextQuery.compile(), pageTextQuery.params()).then(() => {
            bot.logger.info("Added fulltext of pages to file %s", msg.Path);
          })
        }

        let tokenizer = new natural.WordTokenizer();
        let tokens = tokenizer.tokenize(fulltext);

        let trimmedFulltext = helpers.removeStopWordsFromArray(natural.LancasterStemmer.tokenizeAndStem(fulltext)).join(" ")
        if(fulltext === false) return;
        if(fulltext.trim() === "") {
          return "empty-"+mimetype;
        }

        let wordcount = tokens.length;
        let totalSpelledCorrectly = helpers.spellCheckList(tokens)
        let correctSpellingRatio = totalSpelledCorrectly / wordcount;

        var fulltextQuery = queryBuilder.fulltextQuery({uuid: msg.Uuid, fulltext, fulltextKeywords: trimmedFulltext, wordcount, 
          correctSpellingRatio: correctSpellingRatio !== 0 ? correctSpellingRatio : undefined});

        return bot.neo4j.query(fulltextQuery.compile(), fulltextQuery.params()).then(() => {
          bot.logger.info("Added fulltext to file %s", msg.Path);
          return "success";
        })
      }).catch(err => {
        bot.logger.error("Error performing extraction:", err)
        return "error";
      })
    })
  }

  // Extracts summary text from file
  function ocr(mimetype, file) {
    bot.logger.info("Attempting to perform OCR on image.")
    return twrapper.extract(file, {mimetype, bot}).then((text) => {
      // return truncate(text.toString(),30000).replace(/\s+/g, ' ');
      if(bot.config.get("paginate") && mimetype === "application/pdf") {
        return text.toString().split("\f");
      }

      return text.toString().replace(/\s+/g, ' ');
    })
  }
}
