import React from 'react'
import { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span>Pariflow Docs</span>,
  project: {
    link: 'https://github.com/yourusername/pariflow',
  },
  chat: {
    link: 'https://pariflow.com',
  },
  docsRepositoryBase: 'https://github.com/yourusername/pariflow/tree/main/docs',
  footer: {
    text: 'Pariflow Documentation © 2025',
  },
  primaryHue: 220,
  primarySaturation: 100,
  useNextSeoProps() {
    return {
      titleTemplate: '%s – Pariflow Docs'
    }
  },
  search: {
    placeholder: 'Search documentation...'
  },
  sidebar: {
    defaultMenuCollapseLevel: 1,
    toggleButton: true
  },
  toc: {
    backToTop: true
  }
}

export default config
