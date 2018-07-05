var path = require("path");
var nodeExternals = require("webpack-node-externals");


module.exports = {
  mode: "development",
  target: "node",
  output: {
    devtoolModuleFilenameTemplate: "[absolute-resource-path]",
    devtoolFallbackModuleFilenameTemplate: "[absolute-resource-path]?[hash]"
  },
  externals: [nodeExternals()],
  devtool: "inline-cheap-module-source-map",
  module: {
    rules: [
      {
        test: /\.js$/,
        include: path.resolve("lib"),
        exclude: /\.spec.js$/,
        loader: "istanbul-instrumenter-loader"
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: "babel-loader"
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: "eslint-loader",
        options: {
          emitWarning: true
        }
      }
    ]
  }
};
