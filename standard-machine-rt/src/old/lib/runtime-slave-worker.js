class RuntimeSlaveWorker {
  constructor(apiEnv) {
    // export a skylink api for kernel
    this.env = new Environment();
    this.env.bind('/api', apiEnv);

    this.apiServer = new SkylinkServer(this.env);
    this.apiServer.attach(new ChannelExtension());
    this.apiServer.attach(new MessagePortChannelCarrier());

    // send skylink operations to the kernel
    this.apiClient = new MessagePassingSkylinkClient(self);
    this.apiClient.attach(new MessagePortChannelClient());
    this.apiClient.attach(new SkylinkReversalExtension(this.apiServer));
  }

  // duplicated with daemon/model/workload.js
  async volley(request) {
    const response = await this.apiClient.volley(request);

    if (response.Ok) {
      //console.debug('Kernel response was ok:', response);
      return response;
    } else {
      const output = response.Output || {};
      let error;
      if (output.Type === 'Error') {
        const justMessage = output.Type === 'Error' ?
            output.StringValue.split('\n')[0].split(': ')[1] : '';
        throw new Error(`(kernel) ${justMessage}`);
      } else if (output.Name === 'error-message' && output.Type === 'String') {
        throw new Error(`(kernel) ${output.StringValue}`);
      } else {
        throw new Error(`Kernel message wasn't okay`);
      }
    };
  }

  deviceForKernelPath(path) {
    return new ImportedSkylinkDevice(this, path);
  }
}
