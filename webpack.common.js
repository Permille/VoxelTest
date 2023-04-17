const path = require("path");

module.exports = {
  "entry": "./src/Main.mjs",
  "target": "web",
  "output": {
    "filename": "Bundle.js",
    "path": path.resolve(__dirname, "dist")
  },
  "resolve":{
    "fallback":{
      "crypto": false
    }
  },
  "experiments":{
    "topLevelAwait": true
  },
  "resolveLoader":{
    "alias":{
      "TemplateCSSLoader": path.resolve(__dirname, "TemplateCSSLoader.js"),
      "TemplateHTMLLoader": path.resolve(__dirname, "TemplateHTMLLoader.js"),
      "WatCompilerLoader": path.resolve(__dirname, "WatCompilerLoader.js")
    }
  },
  "module":{
    "rules":[
      {
        "test": /\.(woff|woff2|ttf|eot|png|svg|bmp|tbf|bin|bo3)$/i,
        "type": "asset/resource"
      },
      {
        "test": /\.(fsh|vsh|glsl|wgsl)$/i,
        "type": "asset/source"
      },
      {
        "test": /\.css$/i,
        "use": ["TemplateCSSLoader"]
      },
      {
        "test": /\.(html|xhtml)$/i,
        "use": ["TemplateHTMLLoader"]
      },
      {
        "test": /\.wat$/i,
        "use": ["WatCompilerLoader"]
      },
      {
        "resourceQuery": /file/i,
        "type": 'asset/resource',
      },
      {
        "resourceQuery": /url/i,
        "type": 'asset/inline',
      },
      {
        "resourceQuery": /raw/i,
        "type": 'asset/source',
      },
      {
        "resourceQuery": /copy/i,
        "loader": "file-loader",
        "options": {
          "name": "[name].[ext]"
        }
      }
    ]
  }
};