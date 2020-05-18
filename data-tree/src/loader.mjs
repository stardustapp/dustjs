import { join, resolve, basename } from 'path';
import { readdir } from 'fs/promises';
import { inspect } from 'util';

import {Compiler} from './compiler.mjs';
import * as El from './elements/_index.mjs'; // we give this to the schemas

export class SchemaLoader {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.schemas = new Map;
  }

  async loadAllInDirectory(schemaDir) {
    const realSchemaDir = resolve(this.baseDir, schemaDir);
    for (const fileName of await readdir(realSchemaDir)) {
      const name = basename(fileName, '.mjs');
      if (name === fileName) continue;

      if (this.schemas.has(name)) {
        console.error(`WARN: schema ${name} was already loaded once (additional version being loaded from ${realSchemaDir})`);
      }

      console.log('Loading app schema', name, '...');
      const fullPath = join(realSchemaDir, fileName);
      const {metadata, builder} = await import(fullPath);
      const roots = [];
      builder(El, root => roots.push(root));
      // console.log(metadata, roots);

      // const {Compiler} = await import('@dustjs/data-tree');
      // const compiler = new Compiler({
      //   target: 'firestore',
      //   pathParser(path) {
      //     return PathFragment.from(path);
      //   },
      //   // TODO
      //   // stackValidator(stack) {
      // });

      // const dataTree = compiler.compile(schema);
      this.schemas.set(name, {
        sourcePath: fullPath,
        metadata,
        roots,
      });
      // await firebase.registerApplication(name, );
    }

  }

  compileAll(compileOpts) {
    const compiler = new Compiler(compileOpts);

    const compiled = new Map;
    for (const [name, model] of this.schemas) {
      compiled.set(name, compiler.compile(model));
    }

    // console.log('-->', inspect(compiled, {
    //   showHidden: false, depth: null, colors: true}));
    return compiled;
  }
}
