/** @param {string} name */
const pkg = (name) => `^packages/${name}/`;

/** @param {...string} names */
const anyPackageExceptBySpecifierOrPath = (...names) => [
  `(^|/)@agentpages/(?!(${names.join("|")})(/|$))`,
  `^packages/(?!(${names.join("|")})/)`,
];

const uiFrameworks = "(^|node_modules/)(react|react-dom|vue|svelte)(/|$)";

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "tests-use-public-api",
      severity: "error",
      from: { path: "\\.test\\.ts$" },
      to: { path: "^packages/[^/]+/src/(?!index\\.ts$)" },
    },
    {
      name: "protocol-is-a-leaf",
      severity: "error",
      from: { path: pkg("protocol") },
      to: { path: anyPackageExceptBySpecifierOrPath("protocol") },
    },
    {
      name: "client-only-uses-protocol",
      severity: "error",
      from: { path: pkg("client") },
      to: { path: anyPackageExceptBySpecifierOrPath("client", "protocol") },
    },
    {
      name: "host-is-framework-free",
      severity: "error",
      from: { path: pkg("host") },
      to: { path: [...anyPackageExceptBySpecifierOrPath("host", "protocol"), uiFrameworks] },
    },
    {
      name: "server-only-uses-protocol",
      severity: "error",
      from: { path: pkg("server") },
      to: { path: [...anyPackageExceptBySpecifierOrPath("server", "protocol"), uiFrameworks] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "/dist/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
  },
};
