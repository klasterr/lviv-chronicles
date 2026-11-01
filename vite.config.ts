import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // relative URLs: the build works from the domain root and from a sub-path such as user.github.io/repo/
  build: {
    chunkSizeWarningLimit: 700, // three.js alone is ~600 kB; it is split out so app changes do not invalidate its cache
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] } } },
  },
})
