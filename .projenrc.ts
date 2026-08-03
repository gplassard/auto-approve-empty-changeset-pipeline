// .projenrc.ts
import { TypescriptApplicationProject } from '@gplassard/projen-extensions';
import { TextFile } from 'projen';

// opinionated wrapper around projen TypeScriptProject
const project = new TypescriptApplicationProject({
  name: 'auto-approve-empty-changeset-pipeline',
  devDeps: ['aws-cdk', 'aws-cdk-lib', 'constructs', 'esbuild', '@types/aws-lambda'],
  deps: ['@aws-sdk/client-codepipeline', '@aws-sdk/client-cloudformation', '@aws-lambda-powertools/logger'],
  gitignore: ['cdk.out'],
  eslintOptions: {
    dirs: ['.'],
    devdirs: ['src/bin', 'src/cdk'],
  },
  tsconfig: {
    compilerOptions: {
      skipLibCheck: true,
    },
  },
});
project.addTask('cdk:pipeline', {
  exec: 'pnpm cdk --app \'ts-node src/bin/pipeline.ts\'',
});
project.addTask('cdk:app', {
  exec: 'pnpm cdk --app \'ts-node src/bin/app.ts\'',
});

new TextFile(project, '.pnpmfile.mjs', {
  lines: [
    '// Intentionally empty.',
    '// Some CI setup steps export npm_config_pnpmfile/NPM_CONFIG_PNPMFILE.',
    '// Keeping this file present lets nested `pnpm exec` calls, such as CDK Lambda bundling, run reliably.',
  ],
});

project.synth();
