import amamo from '@amamo/oxlint-config'

export default amamo({
  node: true,
  react: true,
  rules: {
    'eslint/no-underscore-dangle': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/set-state-in-effect': 'warn',
    'tailwindcss/no-unknown-classes': 'warn',
  },
  tailwindcss: { entryPoint: 'src/viewer-app/styles.css' },
  typescript: true,
})
