import { BigNumber } from "@ethersproject/bignumber";
import { Formatter, TransactionReceipt } from "@ethersproject/providers";
import { parseUnits, formatUnits } from "@ethersproject/units";
import { Formats as BaseFormats, FormatFuncs } from "@ethersproject/providers/lib/formatter";
import { shallowCopy } from "@ethersproject/properties";
import { getAddress } from "./address";
import {
  Transaction,
  Msg,
  Directive,
  parse as parseTransaction,
  parseStakingTransaction,
  TransactionResponse,
  StakingTransactionResponse,
  CXTransactionReceipt,
} from "./transactions";
import { Block } from "./provider";

type HarmonyFormats = {
  stakingTransaction: FormatFuncs;

  cXReceipt: FormatFuncs;

  description: FormatFuncs;
  commissionRate: FormatFuncs;

  createValidatorMsg: FormatFuncs;
  createValidatorRequestMsg: FormatFuncs;

  editValidatorMsg: FormatFuncs;
  editValidatorRequestMsg: FormatFuncs;

  delegateMsg: FormatFuncs;
  undelegateMsg: FormatFuncs;
  collectRewardsMsg: FormatFuncs;

  delegation: FormatFuncs;
};

export interface Delegation {
  validatorAddress: string;
  delegatorAddress: string;
  amount: number;
  reward: number;
  undelegations: {
    amount: number;
    reward: number;
  }[];
}

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
  constructor() {
    super();
  }

  getDefaultFormats(): Formats {
    const number = this.number.bind(this);
    const address = this.address.bind(this);
    const data = this.data.bind(this);
    const hash = this.hash.bind(this);
    const bigNumber = this.bigNumber.bind(this);
    const decimal = this.decimal.bind(this);
    const transactionType = this.transactionType.bind(this);

    const value = (v: string) => v; // todo

    const formats = super.getDefaultFormats() as Formats;

    delete formats.transaction.accessList;
    delete formats.transactionRequest.accessList;

    formats.transaction.shardID = number;
    formats.transaction.toShardID = Formatter.allowNull(number);

    formats.transaction.type = Formatter.allowNull(transactionType);
    formats.transactionRequest.type = Formatter.allowNull(transactionType);
    formats.receipt.type = Formatter.allowNull(transactionType);

    Object.assign(formats.block, {
      nonce: number,
      epoch: bigNumber,
      viewID: number,
      stakingTransactions: formats.block.transactions,
    });

    formats.stakingTransaction = {
      hash: hash,

      type: transactionType,

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

    formats.cXReceipt = {
      blockHash: hash,
      blockNumber: number,
      to: address,
      from: address,
      shardID: number,
      toShardID: number,
      value: bigNumber,
      // confirmations: Formatter.allowNull(number, null),
    };

    // msgs formats

    formats.description = {
      name: value,
      identity: value,
      website: value,
      securityContact: value,
      details: value,
    };

    formats.commissionRate = {
      rate: decimal,
      maxRate: decimal,
      maxChangeRate: decimal,
    };

    formats.createValidatorMsg = {
      validatorAddress: address,
      amount: bigNumber,
      minSelfDelegation: bigNumber,
      maxTotalDelegation: bigNumber,
      slotPubKeys: Formatter.arrayOf(value),
    };

    formats.createValidatorRequestMsg = shallowCopy(formats.createValidatorMsg);
    formats.createValidatorRequestMsg.slotKeySigs = Formatter.arrayOf(value);

    formats.editValidatorMsg = {
      validatorAddress: address,
      commissionRate: Formatter.allowNull(decimal, "0x0"),
      minSelfDelegation: Formatter.allowNull(bigNumber, "0x0"),
      maxTotalDelegation: Formatter.allowNull(bigNumber, "0x0"),
      slotPubKeyToAdd: Formatter.allowNull(value, null),
      slotPubKeyToRemove: Formatter.allowNull(value, null),
    };

    formats.editValidatorRequestMsg = shallowCopy(formats.editValidatorMsg);
    formats.editValidatorRequestMsg.slotKeySigs = Formatter.allowNull(Formatter.arrayOf(value), []);
    formats.editValidatorRequestMsg.active = Formatter.allowNull((value) => value, null);

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

    formats.delegation = {
      delegatorAddress: address,
      validatorAddress: address,
      amount: value,
      reward: value,
      undelegations: (v) =>
        Formatter.check(
          {
            amount: value,
            reward: value,
          },
          v
        ),
    };

    return formats;
  }

  decimal(value: any): BigNumber {
    if (value === "0x0") {
      return null;
    }
    return parseUnits(value, 18);
  }

  transaction(value: any): Transaction {
    return parseTransaction(value);
  }

  stakingTransaction(value: any): Transaction {
    return parseStakingTransaction(value);
  }

  transactionType(value: any): Directive {
    let type = value;
    if (typeof value === "string") {
      type = TRANSACTION_TYPES[value];
    }

    // throw on invalid type ?

    return this.number(type);
  }

  transactionRequest(value: any): any {
    const request = Formatter.check(this.formats.transactionRequest, value);

    if (value.type != null) {
      request.msg = this.msgRequest(value.type, value.msg);
    }

    return request;
  }

  msgRequest(type: any, value: any): Msg {
    switch (type) {
      case Directive.CreateValidator: {
        let msg = Formatter.check(this.formats.createValidatorRequestMsg, value);
        msg.commissionRates = Formatter.check(this.formats.commissionRate, value.commissionRates);
        msg.description = Formatter.check(this.formats.description, value.description);
        return msg;
      }
      case Directive.EditValidator: {
        let msg = Formatter.check(this.formats.editValidatorRequestMsg, value);
        msg.description = Formatter.check(this.formats.description, value.description);
        return msg;
      }
      case Directive.Delegate:
        return Formatter.check(this.formats.delegateMsg, value);
      case Directive.Undelegate:
        return Formatter.check(this.formats.undelegateMsg, value);
      case Directive.CollectRewards:
        return Formatter.check(this.formats.collectRewardsMsg, value);
      default:
        throw new Error("Invalid msg type");
    }
  }

  msgResponse(type: any, value: any): Msg {
    switch (type) {
      case Directive.CreateValidator: {
        let msg = Formatter.check(this.formats.createValidatorMsg, value);
        msg.commissionRates = Formatter.check(this.formats.commissionRate, {
          rate: formatUnits(BigNumber.from(value.commissionRate), 18),
          maxRate: formatUnits(BigNumber.from(value.maxCommissionRate), 18),
          maxChangeRate: formatUnits(BigNumber.from(value.maxChangeRate), 18),
        });
        msg.description = Formatter.check(this.formats.description, value);
        return msg;
      }
      case Directive.EditValidator: {
        let msg = Formatter.check(this.formats.editValidatorMsg, value);
        msg.description = Formatter.check(this.formats.description, value);
        return msg;
      }
      case Directive.Delegate:
        return Formatter.check(this.formats.delegateMsg, value);
      case Directive.Undelegate:
        return Formatter.check(this.formats.undelegateMsg, value);
      case Directive.CollectRewards:
        return Formatter.check(this.formats.collectRewardsMsg, value);
      default:
        throw new Error("Invalid msg type");
    }
  }

  address(value: any): string {
    return getAddress(value).checksum;
  }

  _block(value: any, format: any): Block {
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
      result.msg = this.msgResponse(result.type, transaction.msg);
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

  stakingTransactionResponse(transaction: any): StakingTransactionResponse {
    if (transaction.gas != null && transaction.gasLimit == null) {
      transaction.gasLimit = transaction.gas;
    }

    const result: StakingTransactionResponse = Formatter.check(this.formats.stakingTransaction, transaction);
    result.msg = this.msgResponse(result.type, transaction.msg);
    return result;
  }

  receipt(value: any): TransactionReceipt {
    if (value.type != null) {
      value.from = value.sender;
    }

    const result: TransactionReceipt = Formatter.check(this.formats.receipt, value);
    return result;
  }

  cXReceipt(value: any): CXTransactionReceipt {
    return Formatter.check(this.formats.cXReceipt, value);
  }

  delegation(value: any): Delegation {
    return Formatter.check(this.formats.delegation, {
      validatorAddress: value.validator_address,
      delegatorAddress: value.delegator_address,
      amount: value.amount,
      reward: value.reward,
      undelegations: value.Undelegations,
    });
  }
}
