import { Formatter, TransactionReceipt } from "@ethersproject/providers";
import { getAddress } from "./address";
import { Formats as BaseFormats, FormatFuncs } from "@ethersproject/providers/lib/formatter";
import { Transaction, Msg, Directive, parse as parseTransaction, TransactionResponse } from "./transactions";
import { Block } from "./provider";

type HarmonyFormats = {
  stakingTransaction: FormatFuncs;

  delegateMsg: FormatFuncs;
  undelegateMsg: FormatFuncs;
  collectRewardsMsg: FormatFuncs;
};

type Formats = BaseFormats & HarmonyFormats;

const TRANSACTION_TYPES = {
  CreateValidator: 0,
  EditValidator: 1,
  Delegate: 2,
  Undelegate: 3,
  CollectRewards: 4,
};

export default class HarmonyFormatter extends Formatter {
  formats: Formats;
  constructor(private shardId: number) {
    super();
  }

  getDefaultFormats(): Formats {
    const number = this.number.bind(this);
    const address = this.address.bind(this);
    const data = this.data.bind(this);
    const hash = this.hash.bind(this);
    const bigNumber = this.bigNumber.bind(this);

    const formats = super.getDefaultFormats() as Formats;

    delete formats.transaction.accessList;
    delete formats.transactionRequest.accessList;

    Object.assign(formats.block, {
      nonce: number,
      epoch: bigNumber,
      shardID: number,
      viewID: number,
      stakingTransactions: formats.block.transactions,
    });

    formats.stakingTransaction = {
      hash: hash,
      type: this.transactionType.bind(this),

      blockHash: Formatter.allowNull(hash, null),
      blockNumber: Formatter.allowNull(number, null),
      transactionIndex: Formatter.allowNull(number, null),

      confirmations: Formatter.allowNull(number, null),

      from: address,

      gasPrice: bigNumber,
      gasLimit: bigNumber,
      nonce: number,

      r: Formatter.allowNull(this.uint256),
      s: Formatter.allowNull(this.uint256),
      v: Formatter.allowNull(number),

      raw: Formatter.allowNull(data),
    };

    Object.assign(formats.blockWithTransactions, {
      nonce: number,
      epoch: bigNumber,
      shardID: number,
      viewID: number,
      stakingTransactions: formats.blockWithTransactions.transactions,
    });

    // msgs formats

    formats.delegateMsg = {
      delegatorAddress: address,
      validatorAddress: address,
      amount: bigNumber,
    };

    formats.undelegateMsg = {
      delegatorAddress: address,
      validatorAddress: address,
      amount: bigNumber,
    };

    formats.collectRewardsMsg = {
      delegatorAddress: address,
    };

    return formats;
  }

  transaction(value: any): Transaction {
    return parseTransaction(value);
  }

  transactionType(value: any): Directive {
    let type = value;
    if (typeof value === "string") {
      type = TRANSACTION_TYPES[value];
    }
    return this.number(type);
  }

  transactionRequest(value: any): any {
    const request = Formatter.check(this.formats.transactionRequest, value);

    if (value.type != null) {
      request.msg = this.msg(value.type, value.msg);
    }

    return request;
  }

  msg(type: any, value: any): Msg {
    switch (type) {
      case Directive.Delegate:
        return Formatter.check(this.formats.delegateMsg, value);
      case Directive.Undelegate:
        return Formatter.check(this.formats.undelegateMsg, value);
      case Directive.CollectRewards:
        return Formatter.check(this.formats.collectRewardsMsg, value);
      default:
        return value;
        throw new Error("Invalid msg type");
    }
  }

  address(value: any): string {
    return getAddress(value).checksum;
  }

  _block(value: any, format: any): Block {
    if (value.shardID == null) {
      value.shardID = this.shardId;
    }
    return super._block(value, format) as Block;
  }

  block(value: any): Block {
    return this._block(value, this.formats.block);
  }

  blockWithTransactions(value: any): Block {
    return this._block(value, this.formats.blockWithTransactions);
  }

  transactionResponse(transaction: any): TransactionResponse {
    // Rename gas to gasLimit
    if (transaction.gas != null && transaction.gasLimit == null) {
      transaction.gasLimit = transaction.gas;
    }

    if (transaction.type != null) {
      const result: TransactionResponse = Formatter.check(this.formats.stakingTransaction, transaction);
      result.msg = this.msg(result.type, transaction.msg);
      return result;
    }

    // Rename input to data
    if (transaction.input != null && transaction.data == null) {
      transaction.data = transaction.input;
    }

    // If to and creates are empty, populate the creates from the transaction
    if (transaction.to == null && transaction.creates == null) {
      transaction.creates = this.contractAddress(transaction);
    }

    const result: TransactionResponse = Formatter.check(this.formats.transaction, transaction);

    // 0x0000... should actually be null
    if (result.blockHash && result.blockHash.replace(/0/g, "") === "x") {
      result.blockHash = null;
    }

    return result;
  }

  receipt(value: any): TransactionReceipt {
    const result: TransactionReceipt = Formatter.check(this.formats.receipt, value);
    return result;
  }
}
