// .projenrc.ts
import { TypescriptApplicationProject } from '@gplassard/projen-extensions';

// opinionated wrapper around projen TypeScriptProject
const project = new TypescriptApplicationProject({
    name: 'auto-approve-empty-changeset-pipeline',
});
project.synth();