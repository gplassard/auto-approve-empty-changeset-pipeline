// .projenrc.ts
import { TypescriptApplicationProject } from '@gplassard/projen-extensions';

// opinionated wrapper around projen TypeScriptProject
const project = new TypescriptApplicationProject({
  name: 'auto-approve-empty-changeset-pipeline',
  devDeps: ['aws-cdk', 'aws-cdk-lib', 'constructs', 'esbuild'],
  srcdir: '.',
  scripts: {
    'cdk:pipeline': 'yarn cdk --app \'ts-node bin/pipeline.ts\'',
    'cdk:app': 'yarn cdk --app \'ts-node bin/app.ts\'',
  },
  gitignore: [...TypescriptApplicationProject.DEFAULT_GITIGNORE, 'cdk.out'],
  eslintOptions: {
    dirs: ['.'],
    devdirs: ['bin', 'src/cdk'],
  },
});
project.synth();
