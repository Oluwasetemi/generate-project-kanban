import setemiojo from '@setemiojo/eslint-config'

export default setemiojo(
  {
    react: true,
    antislop: true,
    typescript: {
      tsconfigPath: './tsconfig.json',
    },
    ignores: ['dist/', 'node_modules/'],
  },
  {
    rules: {
      'no-undef': 'off',
      'react-refresh/only-export-components': 'off',
      'setemiojo/no-top-level-await': 'off',
      'style/max-statements-per-line': 'off',
      'ts/await-thenable': 'off',
      'ts/no-unsafe-argument': 'off',
      'ts/no-unsafe-assignment': 'off',
      'ts/no-unsafe-return': 'off',
      'ts/restrict-template-expressions': 'off',
      'ts/strict-boolean-expressions': 'off',
    },
  },
)
