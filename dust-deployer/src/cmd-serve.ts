import * as flags from "https://deno.land/std@0.78.0/flags/mod.ts";
import * as clr from 'https://deno.land/std@0.78.0/fmt/colors.ts';
import { join } from 'https://deno.land/std@0.78.0/path/mod.ts';

import { Loader } from './loader.ts';
import { disregardSignals, ServiceRunner } from './runner.ts';

const DUSTJS_DEPLOYMENTS_DIR = Deno.env.get('DUSTJS_DEPLOYMENTS_DIR');
const DUSTJS_APPS_PATH = Deno.env.get('DUSTJS_APPS_PATH');

export async function cmdServe(args: string[]) {
  const opts = flags.parse(args, {
    boolean: ['send-notifs'],
    string: [
      'only',
      'deployments-dir',
      'dustjs-path',
      'apps-path',
    ],
    default: {
      'send-notifs': false,
      'only': 'firebase,backend',
      'deployments-dir': DUSTJS_DEPLOYMENTS_DIR,
      'dustjs-path': '/home/dan/Code/@stardustapp/dustjs',
      'apps-path': DUSTJS_APPS_PATH,
    },
  });
  return handler({
    sendNotifs: opts['send-notifs'] as boolean,
    only: opts['only'].split(','),
    deploymentsDir: opts['deployments-dir'],
    dustjsPath: opts['dustjs-path'],
    appsPath: opts['apps-path'],
  });
}

async function handler(argv: {
  sendNotifs: boolean;
  only: string[];
  deploymentsDir: string;
  dustjsPath: string;
  appsPath: string;
}) {
  const loader = new Loader(Deno.cwd());
  const runner = new ServiceRunner();

  function startRunningNpmBuild(modulePath: string) {
    const libBuild = runner.launchBackgroundProcess('npm', {
      args: ['run', 'dev'],
      cwd: modulePath,
    });
    return new Promise<true|string>(async ok => {
      for await (const line of libBuild.perLine()) {
        // TODO: 'waiting for changes' only logged when in pty
        if (line.includes('waiting for changes')) {
          ok(true);
        } else if (line.includes('created') && line.includes('.js') && !line.includes('.cjs.js')) {
          console.log(`   `, clr.magenta('rollup:'), line);
          ok(line);
        } else if (line.includes('!')) {
          if (argv['sendNotifs'] && line.includes('[!]')) {
            Deno.run({cmd: ['notify-send', '-a', 'dust-deployer serve', 'rollup build error', line]});
          }
          console.log(`   `, clr.magenta('rollup:'), line);
        }
      }
    });
  }

  console.log();
  const project = await loader.loadProjectConfig(argv);
  await project.fetchMissingPackages();
  console.log();

  if (argv.only.includes('firebase') && argv['dustjsPath']) {
    console.log(`==>`, `Checking for local @dustjs modules to build directly`);
    ServiceRunner.registerKnownDir(argv['dustjsPath'], '$DustJsCheckout');

    for (const [library, _] of project.libraryDirs) {
      if (!library.npm_module.startsWith('@dustjs/') && !library.source) continue;

      const baseName = library.npm_module.split('/')[1];
      const srcPath = library.source
        ? join(Deno.cwd(), library.source)
        : join(argv['dustjsPath'], baseName);
      const exists = await Deno.stat(join(srcPath, 'package.json'))
        .then(() => true, () => false);
      if (!exists) {
        console.log('!-> Skipping local library', library.npm_module, `because it wasn't found at`, srcPath);
        continue;
      }

      console.log(`--> Starting ${library.npm_module} live-compile from local checkout`);
      await startRunningNpmBuild(srcPath);
      project.libraryDirs.set(library, srcPath);
    }
    console.log();
  }

  if (argv.only.includes('backend')) {
    const targetDir = await runner.createTempDir();
    const backendDir = join(argv['dustjsPath'], 'backend-firebase');

    console.log(`--> Preparing backend schemas`);
    await runner.execUtility('mkdir', [join(targetDir, 'schemas')]);
    for (const app of project.resolvedApps) {
      await runner.execUtility('ln', ['-s',
        join(app.directory, 'schema.mjs'),
        join(targetDir, 'schemas', `${app.id}.mjs`)]);
    }
    const {extraSchemasDir} = project.projectConfig;
    if (extraSchemasDir) {
      for await (const schemaFile of Deno.readDir(extraSchemasDir)) {
        if (schemaFile.isDirectory) continue;
        await runner.execUtility('ln', ['-s',
          join(Deno.cwd(), extraSchemasDir, schemaFile.name),
          join(targetDir, 'schemas', schemaFile.name)]);
      }
    }

    const {
      project_id, database_url, admin_uids,
    } = project.deploymentConfig.authority.firebase;

    console.log(`==> Starting Backend...`);
    const backendProc = runner.launchBackgroundProcess('node', {
      args: ['--unhandled-rejections=strict', 'src/app-standalone.js'],
      cwd: backendDir,
      env: {
        'FIREBASE_PROJECT_ID': project_id,
        'FIREBASE_DATABASE_URL': database_url,
        'FIREBASE_ADMIN_UIDS': (admin_uids||[]).join(','),
        'SKYLINK_ALLOWED_ORIGINS': 'http://localhost:5000', // allowed_origins.join(','),
        'GOOGLE_APPLICATION_CREDENTIALS': join(project.configDir, 'firebase-service-account.json'),
        'DUSTJS_SCHEMA_PATH': join(targetDir, 'schemas')+'/',
      },
    });

    await new Promise<true>(async ok => {
      for await (const line of backendProc.perLine()) {
        if (line.includes('App listening on')) {
          console.log(`-->`, `Backend is ready to go.`);
          console.log();
          ok(true);
        }
        if (!line.startsWith('--> inbound operation')) {
          console.log(`   `, clr.magenta('backend:'), line);
        }
      }
    });
  }

  if (argv.only.includes('firebase')) {
    console.log(`--> Preparing live public directory`);

    const targetDir = join('firebase', 'public-linked');
    ServiceRunner.registerKnownDir(targetDir, '$WebTarget');
    await runner.execUtility('rm', ['-rf', targetDir]);
    await runner.execUtility('mkdir', [targetDir]);
    runner.addTempDir(targetDir);

    // what we can do of manual public/
    const publicDir = join('firebase', 'public');
    for await (const file of Deno.readDir(publicDir)) {
      await runner.execUtility(`ln`, [`-s`,
        join('..', 'public', file.name),
        join(targetDir, file.name)]);
    }

    // the apps
    for (const app of project.resolvedApps) {
      const webTarget = join(targetDir, app.id);

      const staticBundle = (app.appConfig.bundles || [])
        .find(x => x.type === 'static html');
      if (staticBundle) {
        await runner.execUtility('ln', ['-s',
          join(app.directory, staticBundle.source),
          webTarget]);
        continue;
      }

      const rollupBundle = (app.appConfig.bundles || [])
        .find(x => x.type === 'rollup');
      if (rollupBundle) {
        console.log(`--> Starting ${app.id} live-compile from app directory`);
        await startRunningNpmBuild(join(app.directory, rollupBundle.source));
        // link the dist subfolder
        await runner.execUtility('ln', ['-s',
          join(app.directory, rollupBundle.source, 'dist'),
          webTarget]);
        continue;
      }

      console.log('!-> WARN: App', app.id, 'lacks an HTML bundle');
    }

    // js libraries
    const libDir = join(targetDir, '~~', 'lib');
    console.log(`--> Copying hosted libraries`);
    await runner.execUtility('mkdir', ['-p', libDir]);
    for (const lib of project.projectConfig.hosted_libraries || []) {
      const cacheDir = project.libraryDirs.get(lib);
      if (!cacheDir) throw new Error(
        `BUG: ${lib.npm_module} wasn't found locally`);
      await runner.execUtility('ln', ['-s',
        join(cacheDir, lib.sub_path||''),
        join(libDir, lib.npm_module.replace('/', '-'))]);
    }

    console.log(`==> Starting Firebase Hosting...`);
    const fireServe = runner.launchBackgroundProcess('firebase', {
      args: ['serve', '--only', 'hosting'],
      cwd: join(Deno.cwd(), 'firebase'),
    });

    const url = await new Promise<string>(async ok => {
      for await (const line of fireServe.perLine()) {
        const match = line.match(/"([A-Z]+) ([^ ]+) (HTTP\/[0-9.]+)" ([0-9-]+) ([0-9-]+) "/);
        if (line.includes('Local server:')) {
          ok((line.match(/http[:\/a-z0-9\[\]-]+/i) ?? [''])[0]);
        } else if (match) {
          const [_, verb, path, proto, status, size] = match;
          if (status === '200' && (path.startsWith('/~~') ||  path.startsWith('/__'))) {
            console.log(`   `, clr.magenta('firebase:'), clr.gray(`${verb} ${path} ${status}`));
          } else {
            const statusColor = ({'2': clr.green, '3': clr.cyan, '4': clr.yellow, '5': clr.red} as Record<string,(a:string)=>string>)[status[0]] || clr.cyan;
            const extraFmt = (parseInt(status) >= 300) ? clr.bold : ((x: string) => x);
            console.log(`   `, clr.magenta('firebase:'), clr.blue(verb), clr.cyan(path), statusColor(extraFmt ? extraFmt(status) : status));
          }
        }
      }
    });
    console.log(`-->`, `Firebase serving at`, clr.bold(url));
    console.log();
  }

  // the process lives on until signalled
}
