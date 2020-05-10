import {BaseParentElement} from './_base.mjs';

export class DatePartitionedLog extends BaseParentElement {

  static family = "PartitionedLog";
  get config() {
    return {
      partitionBy: 'Date',
    };
  }

}
