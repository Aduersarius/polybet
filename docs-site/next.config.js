const withNextra = require('nextra')({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx',
  latex: true,
  search: {
    codeblocks: false
  }
})

module.exports = withNextra({
  output: 'standalone',
  basePath: process.env.NODE_ENV === 'production' ? '' : '',
  images: {
    unoptimized: true
  }
})
