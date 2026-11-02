import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'univerfile-sqlite',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000
  }
})
