const execa = require('execa');
const chalk = require('chalk');
const sleep = require('util').promisify(setTimeout);

exports.generateIngress = ({
  serviceName, annotations, domains,
}) => ({
  apiVersion: 'extensions/v1beta1',
  kind: 'Ingress',
  metadata: {
    name: `${serviceName}-fe`,
    annotations,
  },
  spec: {
    tls: [{
      hosts: domains,
      secretName: `${serviceName}-tls`,
    }],
    rules: domains.map(domain => ({
      host: domain,
      http: {
        paths: [{
          path: '/',
          backend: {
            serviceName: serviceName,
            servicePort: 'http',
          }}]},
    })),
  }});

exports.generateDeploymentPatch = (name, {
  deployment={},
  pod={},
  containerName='app',
  container={},
}) => ({
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: { name },
  spec: {
    ...deployment,
    template: { spec: {
      ...pod,
      containers: [{
        name: containerName,
        ...container,
      }],
    }},
  }});

exports.Client = class KubernetesClient {
  constructor(context, namespace) {
    this.context = context;
    this.namespace = namespace;
  }

  execKubectl(args, opts={}) {
    return execa(`kubectl`, [
      '--context', this.context,
      '--namespace', this.namespace,
      ...args,
    ], opts);
  }

  async pollForPodStability(labels) {
    const labelStr = Object.keys(labels)
      .map(x => `${x}=${labels[x]}`)
      .join(',');

    const seenPods = new Map;
    while (true) {
      await sleep(5000);

      // Dumbly parse the kubectl stdout
      const {stdout} = await this.execKubectl([
        'get', 'pods', '-l', labelStr]);
      const allPods = stdout.split(`\n`).slice(1).map(x => {
        const [name, running, status, restarts, age] = x.split(/ +/);
        return {name, running, status, restarts, age};
      }).filter(x => x.running.includes('/'));

      // List all pods that aren't fully Ready
      const badPods = allPods.filter(x => {
        if (x.status !== 'Running') return true;
        const [_, ready, total] = x.running.match(/^(\d+)\/(\d+)$/);
        if (ready !== total) return true;
        return false;
      });

      if (badPods.length === 0) {
        // All good :)
        return allPods;
      }

      for (const pod of badPods) {
        // Check if the pod's health changed
        const healthStr = [
          pod.running,
          pod.status,
          pod.restarts,
        ].join(',');
        if (seenPods.get(pod.name) === healthStr) continue;
        seenPods.set(pod.name, healthStr);

        // Log the new pod health
        let statusStr = chalk[{
          Pending: 'cyan',
          ContainerCreating: 'cyan',
          Running: 'green',
          Terminating: 'yellow',
        }[pod.status]||'red'](pod.status);
        statusStr += ` (${pod.running} ready`;
        if (pod.restarts !== '0') {
          statusStr += `, ${chalk.red(pod.restarts+' restarts')}`;
        }
        statusStr += `, ${chalk.bold(pod.age)} old)`;
        console.log('   ', chalk.cyan(pod.name), 'is now', statusStr);
      }
    }
  }
};
