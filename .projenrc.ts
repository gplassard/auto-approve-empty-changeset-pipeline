// .projenrc.ts
import { TypescriptApplicationProject } from '@gplassard/projen-extensions';

// opinionated wrapper around projen TypeScriptProject
const project = new TypescriptApplicationProject({
  name: 'auto-approve-empty-changeset-pipeline',
  devDeps: ['aws-cdk', 'aws-cdk-lib', 'constructs', 'esbuild', '@types/aws-lambda'],
  deps: ['@aws-sdk/client-codepipeline', '@aws-sdk/client-cloudformation', '@aws-lambda-powertools/logger'],
  scripts: {
    'cdk:pipeline': 'pnpm cdk --app \'ts-node src/bin/pipeline.ts\'',
    'cdk:app': 'pnpm cdk --app \'ts-node src/bin/app.ts\'',
  },
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
project.synth();
