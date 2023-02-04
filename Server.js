const http = require("http");
const path = require("path");
const url = require("url");
const fs = require("fs");

const ExtensionToMIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".xhtml": "text/html",
  ".html": "text/html",
  ".css": "text/css",
  ".png": "image/png"
};

const Server = http.createServer(async function(Request, Response){
  const Path = "." + url.parse(Request.url).pathname;
  console.log(Path);
  try{
    const File = await fs.promises.readFile(Path);
    Response.setHeader("Content-type", ExtensionToMIME[path.parse(Path).ext] ?? "text/plain");
    Response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    Response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    Response.end(File);
  } catch(e){
    Response.statusCode = 404;
    Response.end("File at " + Path + " doesn't exist. If this is your first time loading, reload the page, or close and reopen the window.");
  }
})
Server.listen(27, "127.0.0.1", console.log.bind(null, "Program loaded at http://127.0.0.1:27/dist/index.html"));

module.exports = Server;
