import {BaseParentElement} from './_base.mjs';

export class DatePartitionedLog extends BaseParentElement {
  constructor(childSpec, hints={}) {
    super(childSpec);
    this.hints = hints;
  }

  static family = "PartitionedLog";
  get config() {
    return {
      partitionBy: 'Date',
      innerMode: 'AppendOnly',
      hints: this.hints,
    };
  }

}
