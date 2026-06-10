module.exports = {
  presets: [
    '@vue/app'
  ]
  // webpack 4's parser (acorn 6) cannot READ modern syntax, regardless of
  // browser targets — force-transpile it so transpiled deps (chart.js 4,
  // vue-chartjs 5) emit webpack-4-parsable output. Obsolete under Vite.
  , plugins: [
    '@babel/plugin-transform-optional-chaining'
    , '@babel/plugin-transform-nullish-coalescing-operator'
    , '@babel/plugin-transform-logical-assignment-operators'
    , '@babel/plugin-transform-class-properties'
  ]
}
