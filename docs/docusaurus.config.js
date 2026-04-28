// @ts-check
'use strict';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Crossplane Workshop',
  tagline: 'Hands-on with Crossplane on Kubernetes',
  favicon: 'img/favicon.ico',

  url: 'https://crossplane-workshop.example.com',
  baseUrl: '/',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Enable Mermaid diagrams in MDX (```mermaid fenced blocks).
  // Used in the 101 modules to visualise XRD/Composition/XR fan-out
  // and Provider runtime architecture.
  markdown: {
    mermaid: true,
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          routeBasePath: '/',
          beforeDefaultRemarkPlugins: [require('./src/remark/replace-ref.js')],
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  // Site-wide themes: mermaid (for ```mermaid fenced blocks in 101) plus
  // `@easyops-cn/docusaurus-search-local` for client-side full-text search.
  themes: [
    '@docusaurus/theme-mermaid',
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        indexDocs: true,
        indexBlog: false,
        indexPages: false,
        docsRouteBasePath: '/',
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  // Dev-only inline plugin: forward `/api/*` from the Docusaurus dev
  // server to the locally-running validator (default :8081). Pair with
  // `VALIDATOR_LOCAL=1 go run ./validator` in the `validator/` directory
  // — then `npm run start` in `docs/` + open http://localhost:3000/dashboard.
  // Override the target with VALIDATOR_DEV_URL if you port-forwarded
  // from a cluster instead.
  plugins: [
    function devApiProxyPlugin() {
      return {
        name: 'dev-api-proxy',
        configureWebpack(_config, isServer) {
          if (isServer) return {};
          return {
            devServer: {
              proxy: [
                {
                  context: ['/api'],
                  target: process.env.VALIDATOR_DEV_URL || 'http://localhost:8081',
                  changeOrigin: true,
                },
              ],
            },
          };
        },
      };
    },
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Crossplane Workshop',
        items: [
          { to: '/dashboard', label: 'Dashboard', position: 'left' },
          { to: '/wall', label: 'Wall', position: 'left' },
        ],
      },
      footer: {
        style: 'dark',
        copyright: `Copyright © ${new Date().getFullYear()} Crossplane Workshop.`,
      },
    }),
};

module.exports = config;
