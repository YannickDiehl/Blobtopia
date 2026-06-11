import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'crates/**', 'public/**', 'data/**', 'e2e-baseline/**', 'e2e-shots/**', '.vercel/**', 'scripts/__pycache__/**']
  }
  , js.configs.recommended
  , ...pluginVue.configs['flat/essential']
  , {
    languageOptions: {
      ecmaVersion: 'latest'
      , sourceType: 'module'
      , globals: {
        window: 'readonly'
        , document: 'readonly'
        , navigator: 'readonly'
        , localStorage: 'readonly'
        , fetch: 'readonly'
        , console: 'readonly'
        , setTimeout: 'readonly'
        , clearTimeout: 'readonly'
        , setInterval: 'readonly'
        , clearInterval: 'readonly'
        , requestAnimationFrame: 'readonly'
        , performance: 'readonly'
        , URL: 'readonly'
        , URLSearchParams: 'readonly'
        , Blob: 'readonly'
        , FileReader: 'readonly'
        , Image: 'readonly'
        , AbortController: 'readonly'
        , process: 'readonly'
        , Buffer: 'readonly'
        , getComputedStyle: 'readonly'
        , ResizeObserver: 'readonly'
        , cancelAnimationFrame: 'readonly'
      }
    }
    // Haus-Stil: comma-first (aus der alten package.json-eslintConfig übernommen)
    , rules: {
      'comma-style': ['error', 'first']
      , 'no-unused-vars': ['error', {
        args: 'after-used'
        , argsIgnorePattern: '^_'
        , varsIgnorePattern: '^_'
        , caughtErrorsIgnorePattern: '^_'
      }]
      , 'vue/multi-word-component-names': 'off'
    }
  }
  // Node-Skripte (CJS) + Vercel-Function: eigene Umgebung, lockerer Stil —
  // die alte vue-cli-Lint-Konfiguration hat diese Dateien nie geprüft
  // Vercel-Function ist ESM
  , {
    files: ['api/**/*.js']
    , languageOptions: {
      sourceType: 'module'
      , globals: {
        process: 'readonly'
        , console: 'readonly'
        , fetch: 'readonly'
        , setTimeout: 'readonly'
      }
    }
    , rules: {
      'comma-style': 'off'
      , 'no-useless-escape': 'off'
    }
  }
  , {
    files: ['scripts/**/*.js']
    , languageOptions: {
      sourceType: 'commonjs'
      , globals: {
        require: 'readonly'
        , module: 'writable'
        , process: 'readonly'
        , console: 'readonly'
        , Buffer: 'readonly'
        , __dirname: 'readonly'
        , setTimeout: 'readonly'
        , setInterval: 'readonly'
        , clearTimeout: 'readonly'
        , clearInterval: 'readonly'
        , fetch: 'readonly'
        , URL: 'readonly'
        , globalThis: 'readonly'
        , AbortController: 'readonly'
      }
    }
    , rules: {
      'comma-style': 'off'
      , 'no-unused-vars': 'warn'
      , 'no-empty': 'off'
      , 'no-useless-escape': 'off'
      , 'no-constant-condition': ['error', { checkLoops: false }]
    }
  }
  , {
    files: ['scripts/**/*.mjs']
    , languageOptions: {
      sourceType: 'module'
      , globals: {
        process: 'readonly'
        , console: 'readonly'
        , Buffer: 'readonly'
        , setTimeout: 'readonly'
        , fetch: 'readonly'
        , URL: 'readonly'
      }
    }
    , rules: {
      'comma-style': 'off'
    }
  }
]
