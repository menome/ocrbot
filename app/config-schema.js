/**
 * Copyright (c) 2017 Menome Technologies Inc.
 * Configuration for the bot
 */
"use strict";

module.exports = {
  downstream_actions: { // Tells us where to put stuff based on 
    doc: "Key/value pairs. keys are string-type result codes. Values are the next routing key to push the message to, or false to end the processing.",
    default: { success: false, error: false},
    format: function check(routing) {
      Object.keys(routing).forEach((key) => {
        if(typeof routing[key] !== 'string' && routing[key] !== false && !Array.isArray(routing[key]))
          throw new Error("Routing keys must be strings, or 'false'.")
      })
    }
  }
};