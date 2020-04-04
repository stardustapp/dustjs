class RunnableMutex {
  constructor(innerFunc) {
    this.innerFunc = innerFunc;
    this.isLocked = false;
    this.waitQueue = new Array;

    this.warnInterval = setInterval(() => {
      if (this.waitQueue.length) {
        console.warn('RunnableMutex has', this.waitQueue.length, 'waiting calls');
      }
    }, 1000);
    if (this.warnInterval.unref)
      this.warnInterval.unref();
  }
  stop() {
    delete this.innerFunc;
    clearInterval(this.warnInterval);
  }

  // user entrypoint that either runs immediately or queues for later
  submit(...args) {
    if (this.isLocked) {
      return new Promise((resolve, reject) => {
        this.waitQueue.push({
          args, resolve, reject,
        });
      });
    }

    try {
      this.isLocked = true;
      return this.immediateTransact(args);
    } finally {
      this.isLocked = false;
      if (this.waitQueue.length) {
        this.runWaitingTxns();
      }
    }
  }

  // model entrypoint that runs everything that's waiting
  async runWaitingTxns() {
    if (this.isLocked) throw new Error(`runWaitingTxns() ran when not actually ready to lock`);
    try {
      console.group('Processing all queued transactions');

      // process until there's nothing left
      this.isLocked = true;
      while (this.waitQueue.length) {
        const {args, resolve, reject} = this.waitQueue.shift();
        // pipe result to the original
        const txnPromise = this.immediateTransact(args);
        txnPromise.then(resolve, reject);
        await txnPromise;
      }
      this.isLocked = false;

    } finally {
      console.groupEnd();
      if (this.waitQueue.length) {
        console.warn('WARN: still had work queued after runWaitingTxns() completed');
      }
    }
  }

  async immediateTransact(args) {
    let txn;
    try {
      txn = this.innerFunc(...args);
      return await txn;

    } catch (err) {
      // TODO: specific Error subclass instead
      if (txn && txn.error) {
        console.warn('Database transaction failed:', txn.error);
        throw idbTx.error;
      }
      console.error('RunnableMutex transaction crash:', err.message);
      if (txn && txn.abort) {
        console.warn('Aborting transaction due to', err.name);
        txn.abort();
      }
      throw err;//new Error(`GraphTxn rolled back due to ${err.stack.split('\n')[0]}`);
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    RunnableMutex,
  };
}
