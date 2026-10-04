/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// The browser Analytics page (src/renderer/analyticsPage). Built to
// build/analytics/, which main's local analytics server serves. A plain web
// bundle: it runs in the user's browser, not in Electron.

const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

const configFile = path.join(__dirname, 'src', 'renderer', 'tsconfig.json');
const configFileObj = require(configFile);
const isProd = process.env.NODE_ENV === 'production';
const isDev = !isProd;

module.exports = {
  mode: isProd ? 'production' : 'development',
  // Separate .map files: the page CSP has no 'unsafe-eval', so eval-based devtools can't run.
  devtool: isProd ? undefined : 'source-map',
  entry: {
    analytics: path.join(__dirname, 'src', 'renderer', 'analyticsPage', 'index.tsx'),
  },
  output: {
    path: path.join(__dirname, 'build', 'analytics'),
    filename: '[name].js',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    plugins: [new TsconfigPathsPlugin({ configFile })]
  },
  target: 'web',
  module: {
    rules: [
      {
        test: /\.ts(x?)$/,
        exclude: /node_modules/,
        use: [{
          loader: 'swc-loader',
          options: {
            jsc: {
              target: configFileObj.target,
              paths: configFileObj.paths,
              transform: { react: { runtime: 'automatic', development: isDev, refresh: false } },
            },
          },
        }]
      },
      {
        test: /\.module\.scss$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { modules: { namedExport: false, exportLocalsConvention: 'as-is' }, importLoaders: 1 } },
          'sass-loader',
        ],
      },
    ]
  },
  plugins: [
    new webpack.EnvironmentPlugin({ NODE_ENV: 'development' }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'renderer', 'analyticsPage', 'index.ejs'),
      filename: 'index.html',
    }),
  ],
}
