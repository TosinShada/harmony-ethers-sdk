import {
  Block as BaseBlock,
  Formatter,
  TransactionReceipt,
  TransactionResponse,
} from "@ethersproject/providers";
import { BigNumberish } from "@ethersproject/bignumber";
import { getAddress } from "./address";
import {
  Formats as BaseFormats,
  FormatFuncs,
} from "@ethersproject/providers/lib/formatter";
import {
  Transaction,
  Msg,
  Directive,
  parse as parseTransaction,
} from "./transactions";

export interface Block extends BaseBlock {
  shardId?: BigNumberish;
}

type HarmonyFormats = {
  delegateMsg: FormatFuncs;
};

type Formats = BaseFormats & HarmonyFormats;

export default class HarmonyFormatter extends Formatter {
  formats: Formats;
  constructor(private shardId: number) {
    super();
  }

  getDefaultFormats(): Formats {
    const number = this.number.bind(this);
    const address = this.address.bind(this);
    const bigNumber = this.bigNumber.bind(this);

    const formats = super.getDefaultFormats() as Formats;

    formats.block.nonce = number;
    formats.blockWithTransactions.nonce = number;

    formats.delegateMsg = {
      delegatorAddress: address,
      validatorAddress: address,
      amount: bigNumber,
    };

    return formats;
  }

  transaction(value: any): Transaction {
    return parseTransaction(value);
  }

  msg(type: any, value: any): Msg {
    switch (type) {
      case Directive.Delegate:
        return Formatter.check(this.formats.delegateMsg, value);
      default:
        break;
    }
    return;
  }

  address(value: any): string {
    return getAddress(value).checksum;
  }

  _block(value: any, format: any): Block {
    const baseBlock = super._block(value, format);

    const block: Block = {
      ...baseBlock,
      shardId: this.shardId,
    };

    return block;
  }

  block(value: any): Block {
    const block = this._block(value, this.formats.block);
    return block;
  }

  blockWithTransactions(value: any): Block {
    return this._block(value, this.formats.blockWithTransactions);
  }

  transactionResponse(transaction: any): TransactionResponse {
    // Rename gas to gasLimit
    if (transaction.gas != null && transaction.gasLimit == null) {
      transaction.gasLimit = transaction.gas;
    }

    // Rename input to data
    if (transaction.input != null && transaction.data == null) {
      transaction.data = transaction.input;
    }

    // If to and creates are empty, populate the creates from the transaction
    if (transaction.to == null && transaction.creates == null) {
      transaction.creates = this.contractAddress(transaction);
    }

    const result: TransactionResponse = Formatter.check(
      this.formats.transaction,
      transaction
    );

    // result.chainId = 2;

    // 0x0000... should actually be null
    if (result.blockHash && result.blockHash.replace(/0/g, "") === "x") {
      result.blockHash = null;
    }

    return result;
  }

  receipt(value: any): TransactionReceipt {
    const result: TransactionReceipt = Formatter.check(
      this.formats.receipt,
      value
    );
    return result;
  }
}
