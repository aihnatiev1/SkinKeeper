const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  return {
    entry: {
      background: './src/background/index.ts',
      'content/inventory': './src/content/inventory.ts',
      'content/marketListing': './src/content/marketListing/index.ts',
      'content/tradeOffer': './src/content/tradeOffer.ts',
      'content/tradeOffers': './src/content/tradeOffers.ts',
      'content/market': './src/content/market.ts',
      'content/profile': './src/content/profile.ts',
      'content/nsfw': './src/content/nsfw.ts',
      'content/auth': './src/content/auth.ts',
      'popup/popup': './src/popup/popup.ts',
      'options/options': './src/options/options.ts',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: 'public', to: '.' },
          { from: 'data/bluegem.json.gz', to: 'data/bluegem.json.gz' },
          { from: 'data/dopplerIconMap.json', to: 'data/dopplerIconMap.json' },
        ],
      }),
      new MiniCssExtractPlugin({
        filename: 'styles/skinkeeper.css',
      }),
    ],
    devtool: isProd ? false : 'inline-source-map',
    optimization: {
      minimize: isProd,
    },
  };
};
