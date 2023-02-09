//https://redd.one/blog/writing-custom-webpack-loader
const path = require("path");
module.exports = function(Source){
  return `
    const File = \`${Source.replaceAll(/(`|\\)/g, "\\$1")}\`;
    let OriginalElement = null;
    export default function Add(ClassID, ElementID = "_" + Math.random() * (2 ** 52), CheckAttributes = false){
      if(OriginalElement === null){
        const Parser = new DOMParser;
        OriginalElement = Parser.parseFromString(File, "text/html").body.firstElementChild;
      }
      const RootElement = OriginalElement.cloneNode(true);
      for(const Element of [...(RootElement.matches("[id]") ? [RootElement] : []), ...RootElement.querySelectorAll("[id]")]) Element.setAttribute("id", ElementID + "-" + Element.id);
      for(const Element of [...(RootElement.matches("[class]") ? [RootElement] : []), ...RootElement.querySelectorAll("[class]")]) Element.className = Element.className.replaceAll(/(^| )/g, "$1" + ClassID + "-");
      if(CheckAttributes){
        for(const Element of [RootElement, ...RootElement.querySelectorAll("*")]){
          const Attributes = Element.attributes;
          for(let i = 0; i < Attributes.length; ++i){
            if(/url\\(#/.test(Attributes[i].nodeValue)){
              Element.setAttribute(Attributes[i].name, Attributes[i].nodeValue.replaceAll(/url\\(#([a-zA-Z0-9_\\-]+)\\)/g, "url(#" + ElementID + "-$1)"));
            }
          }
        }
      }
      return [RootElement, ElementID];
    };
  `;
};