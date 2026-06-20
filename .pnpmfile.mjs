// Intentionally empty.
// Some CI setup steps export npm_config_pnpmfile/NPM_CONFIG_PNPMFILE.
// Keeping this file present lets nested `pnpm exec` calls, such as CDK Lambda bundling, run reliably.