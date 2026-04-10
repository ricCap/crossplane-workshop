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
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Crossplane Workshop',
        items: [],
      },
      footer: {
        style: 'dark',
        copyright: `Copyright © ${new Date().getFullYear()} Crossplane Workshop.`,
      },
    }),
};

module.exports = config;
