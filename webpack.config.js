var config = [];

const generateConfig = (name) => ({
    name: name,
    entry: './index.js',
    output: {
      path: __dirname + '/dist/',
      filename: name + '.js',
      sourceMapFilename: name + '.map',
      library: 'ducts',
      libraryTarget: 'umd'
    },
    //node: {
    //  process: false
    //},
    devtool: 'source-map',
    mode: name.indexOf('min')>-1 ? 'production' : 'development'
});

['ducts', 'ducts.min'].forEach((key) => {
  config.push(generateConfig(key));
});

module.exports = config;
