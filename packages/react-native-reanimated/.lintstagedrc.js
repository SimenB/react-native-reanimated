const commonConfig = require('../../.lintstagedrc-common.js');

/** @type {import('lint-staged').Config} */
module.exports = {
  ...commonConfig,
  '*.{cpp,h}': ['clang-format -i'],
};
