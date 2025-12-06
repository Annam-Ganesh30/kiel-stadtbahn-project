// eslint.config.cjs
const geodevModule = require('@dataport/eslint-config-geodev')

// Some packages export their config as `default`
const geodevConfig = geodevModule.default || geodevModule

module.exports = geodevConfig
