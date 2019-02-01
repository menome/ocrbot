"use strict";
const queryBuilder = require('./queryBuilder');
const RabbitClient = require('@menome/botframework/rabbitmq');
// const truncate = require("truncate-utf8-bytes");
const helpers = require('./helpers');
const twrapper = require('./tesseract-wrapper');

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
      return ocr(mimetype, tmpPath).then((fulltext) => {
        if(fulltext === false) return;
        var fulltextQuery = queryBuilder.fulltextQuery(msg.Uuid, fulltext);

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
      return text.toString().replace(/\s+/g, ' ');
    })
  }
}
