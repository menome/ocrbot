var Query = require('decypher').Query;

module.exports = {}

/**
 * Returns a query that updates the given file node with an absolute fuckpile of text
 * in an indexed property.
 */
module.exports.fulltextQuery = function({uuid, fulltext, fulltextKeywords, wordcount, correctSpellingRatio}) {
  var query = new Query();
  query.match("(f:Card {Uuid: $uuid})", {uuid: uuid})
  query.set("f.FullText = $fulltext, f.OcrMethod = $ocrMethod",{fulltext: fulltext, ocrMethod: "tesseract"} )
  if(fulltextKeywords) query.set("f.FullTextKeywords = $fulltextKeywords", {fulltextKeywords})
  if(wordcount) query.set("f.WordCount = $wordcount", {wordcount})
  if(correctSpellingRatio) query.set("f.CorrectSpellingRatio = $correctSpellingRatio", {correctSpellingRatio})
  return query;
}

/**
 * Returns a query that takes an array of fuckpiles of text, puts them into a paginated schema.
 */
module.exports.fulltextPageQuery = function({uuid, pageTextArray}) {
  // Because cypher sucks sometimes.
  var pageTextArrayWithIndices = pageTextArray.map((page, idx) => ({text: page, pageno: idx}))
  var query = new Query();
  query.match("(f:Card {Uuid: $uuid})", {uuid})
  query.foreach("page IN $pages", "MERGE (f)-[:HAS_PAGE]->(p:Page:Card {PageNumber: page.pageno}) ON CREATE SET p.Uuid = apoc.create.uuid() SET p.FullText = page.text, p.Name = f.Name + ' - Page '+page.pageno, f.OcrMethod = $ocrMethod", {pages: pageTextArrayWithIndices, ocrMethod: "tesseract"})
  return query;
}