//https://redd.one/blog/writing-custom-webpack-loader
const path = require("path");
module.exports = function(Source){
  return `
    const File = \`${Source.replaceAll(/(`|\\)/g, "\\$1")}\`;
    let OriginalElement = null;
    export default function Add(ClassID, ElementID = "_" + Math.random() * (2 ** 52)){
      if(OriginalElement === null){
        const Parser = new DOMParser;
        OriginalElement = Parser.parseFromString(File, "text/html").body.firstElementChild;
      }
      const RootElement = OriginalElement.cloneNode(true);
      for(const Element of [...(RootElement.matches("[id]") ? [RootElement] : []), ...RootElement.querySelectorAll("[id]")]) Element.setAttribute("id", ElementID + "-" + Element.id);
      for(const Element of [...(RootElement.matches("[class]") ? [RootElement] : []), ...RootElement.querySelectorAll("[class]")]) Element.className = Element.className.replaceAll(/(^| )/g, "$1" + ClassID + "-");
      return [RootElement, ElementID];
    };
  `;
};