declare module 'prismjs' {
  const Prism: {
    languages: Record<string, unknown>
    highlight: (text: string, grammar: unknown, language: string) => string
  }

  export default Prism
}

declare module 'prismjs/components/*'
