class RuntimeWorker extends Worker {
  constructor(runtimeName, threadName=`${runtimeName} runtime`) {
    super(`src/runtimes/${runtimeName}.js`, {name: threadName});
    this.runtimeName = runtimeName;

    // export a skylink api for worker
    this.env = new Environment();
    this.apiServer = new SkylinkServer(this.env);
    this.apiServer.attach(new ChannelExtension());
    this.apiServer.attach(new MessagePortChannelCarrier());

    // send skylink operations to the worker
    this.apiClient = new MessagePassingSkylinkClient(this);
    this.apiClient.attach(new MessagePortChannelClient());
    this.apiClient.attach(new SkylinkReversalExtension(this.apiServer));

    this.nextFd = 1;
  }

  // Expose a specific environment to the runtime by opening an apiServer FD
  async bindFd(target) {
    const fd = `/fd/${this.nextFd++}`;
    await this.env.bind(fd, target);
    return fd;
  }

  async volley(request) {
    // send request and await response
    const response = await this.apiClient.volley(request);

    if (response.Op) {
      throw new Error(`BUG: huh`);
    } else if (response.Ok) {
      console.debug('RuntimeWorker response was ok:', response);
      return response;
    } else {
      const output = response.Output || {};
      let error;
      if (output.Type === 'Error') {
        const justMessage = output.Type === 'Error' ?
            output.StringValue.split('\n')[0].split(': ')[1] : '';
        throw new Error(`(in ${this.runtimeName} runtime) ${justMessage}`);
      } else {
        throw new Error(`Runtime message wasn't okay`);
      }
    };
  }

  async invokeApi(path, input) {
    const response = await this.volley({
      Op: 'invoke',
      Path: '/api/'+encodeURIComponent(path)+'/invoke',
      Input: {
        Type: 'JS',
        Data: input,
      }
    });

    if (!response.Ok)
      throw new Error(`RuntimeWorker API ${path} didn't invoke cleanly`);
    return (response.Output != null) ? response.Output.Data : null;
  }

  deviceForRuntimePath(path) {
    return new ImportedSkylinkDevice(this, path);
  }
}
