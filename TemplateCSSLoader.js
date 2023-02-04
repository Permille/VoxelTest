//https://redd.one/blog/writing-custom-webpack-loader
const path = require("path");
module.exports = function(Source){
  return `
    const File = \`${Source.replaceAll(/(`|\\)/g, "\\$1")}\`;
    const AddedContexts = new WeakSet;
    export default function Add(ClassID, Context = document){
      if(AddedContexts.has(Context)) return;
      AddedContexts.add(Context);
      const Element = Context.createElement("style");
      Context.head.append(Element);
      Element.textContent = File.replaceAll(/\\.CLASS-/g, "." + ClassID + "-");
    };
  `;
};