const path = require("path");

module.exports = {
  "watch": true,
  "mode": "development",
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
  "module":{
    "rules":[
      {
        "test": /\.(woff|woff2|ttf|eot|png|svg|bmp|tbf|bin|bo3)$/i,
        "type": "asset/resource"
      },
      {
        "test": /\.(fsh|vsh|glsl)$/i,
        "type": "asset/source"
      },
      {
        "test": /\.css$/i,
        "use": ["style-loader", "css-loader"]
      },
      {
        "test": /\.(html|xhtml)$/i,
        "use": ["html-loader"]
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