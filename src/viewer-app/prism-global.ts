import Prism from 'prismjs'

declare global {
  interface Window {
    Prism?: typeof Prism
  }
}

window.Prism = Prism
