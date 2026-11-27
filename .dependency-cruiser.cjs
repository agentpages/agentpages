const pkg = (name) => `^packages/${name}/`;

// Matches other workspace packages by specifier or by resolved path.
const anyPackageExcept = (...names) => [
  `(^|/)@agentpages/(?!(${names.join("|")})(/|$))`,
  `^packages/(?!(${names.join("|")})/)`,
];

const uiFrameworks = "(^|node_modules/)(react|react-dom|vue|svelte)(/|$)";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "protocol-is-a-leaf",
      severity: "error",
      from: { path: pkg("protocol") },
      to: { path: anyPackageExcept("protocol") },
    },
    {
      name: "client-only-uses-protocol",
      severity: "error",
      from: { path: pkg("client") },
      to: { path: anyPackageExcept("client", "protocol") },
    },
    {
      name: "host-is-framework-free",
      severity: "error",
      from: { path: pkg("host") },
      to: { path: [...anyPackageExcept("host", "protocol"), uiFrameworks] },
    },
    {
      name: "server-only-uses-protocol",
      severity: "error",
      from: { path: pkg("server") },
      to: { path: [...anyPackageExcept("server", "protocol"), uiFrameworks] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "/dist/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
  },
};
