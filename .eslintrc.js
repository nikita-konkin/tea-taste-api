// Airbnb's base rules, with the handful that fight this codebase turned off and
// a reason beside each. Everything else is left strict on purpose: the point of
// adding a linter to a project this size is the bugs it finds, and loosening a
// rule because it is noisy today is how it stops finding them.
module.exports = {
  root: true,
  env: { node: true, es2022: true, jest: true },
  extends: ['airbnb-base'],
  parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
  rules: {
    // The working copy is checked out on Windows with autocrlf, so every line
    // in the repo reads as CRLF here and as LF in CI. Git already normalises
    // what is committed; this rule only reports the checkout.
    'linebreak-style': 'off',

    // console is the server's log. There is no other logger, and morgan writes
    // through it too.
    'no-console': 'off',

    // Mongo documents are full of _id, and so is every query that touches one.
    'no-underscore-dangle': 'off',

    // Airbnb bans for..of along with with/label, on the grounds that it pulls in
    // a regenerator polyfill. This is Node 18; it does not.
    'no-restricted-syntax': ['error', 'WithStatement', 'LabeledStatement'],

    'max-len': ['error', {
      code: 120,
      ignoreComments: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,
    }],

    // These four rewrap objects that are perfectly readable on one line into a
    // brace-per-line shape with every property still crammed together. Measured
    // on this codebase: they accounted for most of a 3,500-line autofix diff and
    // not one of those lines read better afterwards.
    'object-curly-newline': 'off',
    'object-property-newline': 'off',
    'function-paren-newline': 'off',
    'implicit-arrow-linebreak': 'off',

    // Tests and their helpers are allowed the devDependencies.
    'import/no-extraneous-dependencies': ['error', { devDependencies: ['tests/**', '**/*.test.js'] }],
  },
  overrides: [
    {
      // These four are mirrors of the frontend's src/i18n files, kept line-for-line
      // comparable with their twins so a missing translation shows up in a diff
      // between the two. Reindenting one half would end that, and they contain no
      // logic to lint — they are data.
      files: ['utils/messages.js', 'utils/descriptors.js', 'utils/options.js', 'utils/teaTypes.js'],
      rules: {
        indent: 'off',
        'no-tabs': 'off',
        quotes: 'off',
        'quote-props': 'off',
        'max-len': 'off',
      },
    },
    {
      // Tests reach for a module mid-file to stub it, await inside a loop to
      // drive a sequence of requests in order, and name a render result after
      // what it is. Each of those is the point of the test, not a slip.
      files: ['tests/**'],
      rules: {
        'global-require': 'off',
        'no-await-in-loop': 'off',
      },
    },
    {
      // Run by hand on the server against the live database. Sequential awaits
      // are the point: they are what keeps the load off a production Mongo.
      files: ['utils/migrate*.js', 'utils/makeAdmin.js'],
      rules: { 'no-await-in-loop': 'off' },
    },
  ],
};
