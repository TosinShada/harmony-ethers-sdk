import {
  arrayify,
  BytesLike,
  SignatureLike,
  splitSignature,
  stripZeros,
  hexlify,
  hexZeroPad,
  isBytesLike,
} from "@ethersproject/bytes";
import { keccak256 } from "@ethersproject/keccak256";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { TransactionRequest as TransactionRequestBase } from "@ethersproject/abstract-provider";
import {
  recoverAddress,
  parse as parseTransaction,
  serialize as serializeTransaction,
  UnsignedTransaction as BaseUnsignedTransaction,
  Transaction as BaseTransaction,
} from "@ethersproject/transactions";
import { Logger } from "@ethersproject/logger";
import { getAddress } from "./address";
import * as RLP from "@ethersproject/rlp";
import { Zero } from "@ethersproject/constants";

const logger = new Logger("hmy_transaction/0.0.1");

export type UnsignedTransaction = BaseUnsignedTransaction & {
  type?: Directive;
  msg?: Msg;
};

export type StakingTransactionRequest =
  | {
      type: Directive.Delegate;
      msg: DelegateMsg;
    }
  | {
      type: Directive.Undelegate;
      msg: UndelegateMsg;
    }
  | {
      type: Directive.CollectRewards;
      msg: CollectRewardsMsg;
    };

export type TransactionRequest =
  | TransactionRequestBase
  | (TransactionRequestBase & StakingTransactionRequest);

export type Transaction = BaseTransaction & {
  type?: Directive;
  msg?: Msg;
};

export type Msg =
  | CommissionRate
  | CreateValidatorMsg
  | EditValidatorMsg
  | DelegateMsg
  | UndelegateMsg
  | CollectRewardsMsg;

export enum Directive {
  CreateValidator,
  EditValidator,
  Delegate,
  Undelegate,
  CollectRewards,
}

interface Description {
  name: string;
  identity: string;
  website: string;
  securityContact: string;
  details: string;
}

interface CommissionRate {
  rate: BigNumberish;
  maxRate: BigNumberish;
  maxChangeRate: BigNumberish;
}

interface CreateValidatorMsg {
  validatorAddress: string;
  description: Description;
  commissionRates: CommissionRate;
  minSelfDelegation: number;
  maxTotalDelegation: number;
  slotPubKeys: string[];
  amount: BigNumberish;
}

interface EditValidatorMsg {
  validatorAddress: string;
  description: Description;
  commissionRate: BigNumberish;
  minSelfDelegation: number;
  maxTotalDelegation: number;
  slotKeyToRemove: string;
  slotKeyToAdd: string;
}

interface DelegateMsg {
  delegatorAddress: string;
  validatorAddress: string;
  amount: BigNumberish;
}

interface UndelegateMsg {
  delegatorAddress: string;
  validatorAddress: string;
  amount: BigNumberish;
}

interface CollectRewardsMsg {
  delegatorAddress: string;
}

function formatNumber(value: BigNumberish, name: string): Uint8Array {
  const result = stripZeros(BigNumber.from(value).toHexString());
  if (result.length > 32) {
    logger.throwArgumentError(
      "invalid length for " + name,
      "transaction:" + name,
      value
    );
  }
  return result;
}

function formatMsg(type: Directive, value: Msg): Array<string | Uint8Array> {
  switch (type) {
    case Directive.Delegate:
    case Directive.Undelegate: {
      const msg = value as DelegateMsg | UndelegateMsg;
      return [
        getAddress(msg.delegatorAddress).checksum,
        getAddress(msg.validatorAddress).checksum,
        formatNumber(msg.amount, "amount"),
      ];
    }
    case Directive.CollectRewards: {
      const msg = value as CollectRewardsMsg;
      return [getAddress(msg.delegatorAddress).checksum];
    }
    default:
      logger.throwArgumentError("invalid type", "type", hexlify(type));
  }
}

export function serialize(
  transaction: UnsignedTransaction,
  signature?: SignatureLike
): string {
  if (transaction.type != null) {
    // return logger.throwError(
    //   `unsupported transaction type: ${transaction.type}`,
    //   Logger.errors.UNSUPPORTED_OPERATION,
    //   {
    //     operation: "serializeTransaction",
    //     transactionType: transaction.type,
    //   }
    // );
    return serializeStakingTransaction(transaction, signature);
  }

  // Legacy Transactions
  return serializeTransaction(transaction, signature);
}

export function serializeStakingTransaction(
  transaction: UnsignedTransaction,
  signature?: SignatureLike
): string {
  const fields: any = [
    BigNumber.from(transaction.type).toHexString(),
    formatMsg(transaction.type, transaction.msg),
    formatNumber(transaction.nonce || 0, "nonce"),
    formatNumber(transaction.gasPrice || 0, "gasPrice"),
    formatNumber(transaction.gasLimit || 0, "gasLimit"),
  ];

  let chainId = 0;
  if (transaction.chainId != null) {
    // A chainId was provided; if non-zero we'll use EIP-155
    chainId = transaction.chainId;

    if (typeof chainId !== "number") {
      logger.throwArgumentError(
        "invalid transaction.chainId",
        "transaction",
        transaction
      );
    }
  } else if (signature && !isBytesLike(signature) && signature.v > 28) {
    // No chainId provided, but the signature is signing with EIP-155; derive chainId
    chainId = Math.floor((signature.v - 35) / 2);
  }

  // We have an EIP-155 transaction (chainId was specified and non-zero)
  if (chainId !== 0) {
    fields.push(hexlify(chainId)); // @TODO: hexValue?
    fields.push("0x");
    fields.push("0x");
  }

  // Requesting an unsigned transation
  if (!signature) {
    return RLP.encode(fields);
  }

  const sig = splitSignature(signature);
  let v = 27 + (sig.recoveryParam || 0);
  fields.pop();
  fields.pop();
  fields.pop();
  v += chainId * 2 + 8;

  fields.push(hexlify(v));
  fields.push(stripZeros(arrayify(sig.r) || []));
  fields.push(stripZeros(arrayify(sig.s) || []));

  return RLP.encode(fields);
}

function handleAddress(value: string): string {
  if (value === "0x") {
    return null;
  }
  return getAddress(value).checksum;
}

function handleNumber(value: string): BigNumber {
  if (value === "0x") {
    return Zero;
  }
  return BigNumber.from(value);
}

function handleMsg(type: Directive, value: Array<string>): Msg {
  const message = value;
  switch (type) {
    case Directive.Undelegate:
    case Directive.Delegate:
      return {
        delegatorAddress: handleAddress(message[0]),
        validatorAddress: handleAddress(message[1]),
        amount: handleNumber(message[2]),
      } as DelegateMsg | UndelegateMsg;
    case Directive.CollectRewards:
      return {
        delegatorAddress: handleAddress(message[0]),
      } as CollectRewardsMsg;
    default:
      logger.throwArgumentError("invalid type", "type", hexlify(type));
  }
}

function parseStakingTransaction(transaction: any): Transaction {
  // const transaction = RLP.decode(payload);

  if (transaction.length !== 5 && transaction.length !== 8) {
    logger.throwArgumentError(
      "invalid component count for staking transaction",
      "payload",
      ""
    );
  }

  const directive: Directive = handleNumber(transaction[0]).toNumber();

  const tx: Transaction = {
    type: directive,
    msg: handleMsg(directive, transaction[1]),
    nonce: handleNumber(transaction[2]).toNumber(),
    gasPrice: handleNumber(transaction[3]),
    gasLimit: handleNumber(transaction[4]),
    chainId: 0,
    data: "0x",
    value: BigNumber.from(0),
  };

  // Unsigned Transaction
  if (transaction.length === 5) {
    return tx;
  }

  try {
    tx.v = BigNumber.from(transaction[5]).toNumber();
  } catch (error) {
    console.log({ error });
    return tx;
  }

  tx.r = hexZeroPad(transaction[6], 32);
  tx.s = hexZeroPad(transaction[7], 32);

  if (BigNumber.from(tx.r).isZero() && BigNumber.from(tx.s).isZero()) {
    // EIP-155 unsigned transaction
    tx.chainId = tx.v;
    tx.v = 0;
  } else {
    // Signed Tranasaction

    tx.chainId = Math.floor((tx.v - 35) / 2);
    if (tx.chainId < 0) {
      tx.chainId = 0;
    }

    let recoveryParam = tx.v - 27;

    const raw = transaction.slice(0, 5);

    if (tx.chainId !== 0) {
      raw.push(hexlify(tx.chainId));
      raw.push("0x");
      raw.push("0x");
      recoveryParam -= tx.chainId * 2 + 8;
    }

    const digest = keccak256(RLP.encode(raw));

    try {
      tx.from = recoverAddress(digest, {
        r: hexlify(tx.r),
        s: hexlify(tx.s),
        recoveryParam: recoveryParam,
      });
    } catch (error) {
      console.log({ error });
    }

    tx.hash = keccak256(RLP.encode(transaction));
  }

  return tx;
}

export function parse(rawTransaction: BytesLike): Transaction {
  const payload = arrayify(rawTransaction);
  const transaction = RLP.decode(payload);

  // TODO: detect if is array without decoding
  if (Array.isArray(transaction[1])) {
    return parseStakingTransaction(transaction);
  }

  return parseTransaction(payload);
}
