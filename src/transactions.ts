import { arrayify, BytesLike, SignatureLike, splitSignature, stripZeros, hexlify, hexZeroPad, isBytesLike } from "@ethersproject/bytes";
import { formatUnits, parseUnits } from "@ethersproject/units";
import { keccak256 } from "@ethersproject/keccak256";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import {
  TransactionRequest as TransactionRequestBase,
  TransactionResponse as TransactionResponseBase,
  TransactionReceipt as TransactionReceiptBase,
} from "@ethersproject/abstract-provider";
import {
  recoverAddress,
  parse as parseTransaction,
  serialize as serializeTransaction,
  UnsignedTransaction as BaseUnsignedTransaction,
  Transaction as BaseTransaction,
} from "@ethersproject/transactions";
import { Logger } from "@ethersproject/logger";
import * as RLP from "@ethersproject/rlp";
import { Zero, One, Two } from "@ethersproject/constants";
import { TextDecoder, TextEncoder } from "util";
import { getAddress } from "./address";
const logger = new Logger("hmy_transaction/0.0.1");

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

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
  rate: string;
  maxRate: string;
  maxChangeRate: string;
}

interface CreateValidatorMsg {
  validatorAddress: string;
  description: Description;
  commissionRates: CommissionRate;
  minSelfDelegation: BigNumberish;
  maxTotalDelegation: BigNumberish;
  slotPubKeys: string[];
  slotKeySigs?: string[];
  amount: BigNumberish;
}

interface EditValidatorMsg {
  validatorAddress: string;
  description?: Partial<Description>;
  commissionRate?: string;
  minSelfDelegation?: BigNumberish;
  maxTotalDelegation?: BigNumberish;
  slotKeyToRemove?: string;
  slotKeyToAdd?: string;
  slotKeySig?: string;
  active?: boolean;
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

export type Msg = CommissionRate | CreateValidatorMsg | EditValidatorMsg | DelegateMsg | UndelegateMsg | CollectRewardsMsg;

export type UnsignedTransaction = Omit<BaseUnsignedTransaction, "accessList"> & {
  type?: Directive;
  msg?: Msg;
};

export type StakingTransactionRequest =
  | {
      type: Directive.CreateValidator;
      msg: CreateValidatorMsg;
    }
  | {
      type: Directive.EditValidator;
      msg: EditValidatorMsg;
    }
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

export type TransactionRequest = TransactionRequestBase | (TransactionRequestBase & StakingTransactionRequest);

export interface Transaction extends Omit<BaseTransaction, "accessList"> {
  type?: Directive;
  msg?: Msg;
}

export interface TransactionReceipt extends TransactionReceiptBase {
  type?: Directive;
}

interface Response {
  blockNumber?: number;
  blockHash?: string;
  timestamp?: number;

  confirmations: number;
}

export interface StakingTransactionResponse extends Transaction, Response {
  hash: string;

  type: Directive;
  msg: Msg;

  // Not optional (as it is in Transaction)
  from: string;

  // The raw transaction
  raw?: string;

  wait: (confirmations?: number) => Promise<TransactionReceipt>;
}

export interface TransactionResponse extends Transaction, Response {
  hash: string;

  // Not optional (as it is in Transaction)
  from: string;

  // The raw transaction
  raw?: string;

  shardID: number;
  toShardID?: number;

  // This function waits until the transaction has been mined
  wait: (confirmations?: number) => Promise<TransactionReceipt>;
}

export interface CXTransactionReceipt {
  blockHash: string;
  blockNumber: number;
  transactionHash: string;
  to: string;
  from: string;
  shardID: number;
  toShardID: number;
  value: BigNumber;
}

function formatNumber(value: BigNumberish, name: string): Uint8Array {
  const result = stripZeros(BigNumber.from(value).toHexString());
  if (result.length > 32) {
    logger.throwArgumentError("invalid length for " + name, "transaction:" + name, value);
  }
  return result;
}

function formatDecimal(value: BigNumberish | string, name: string): Array<string> {
  // const result = formatUnits(parseUnits(value, 18), 18);
  // if (result.length > 32) {
  //   logger.throwArgumentError("invalid length for " + name, "transaction:" + name, value);
  // }

  if (typeof value === "string") {
    return [parseUnits(<string>value, 18).toHexString()];
  }

  return [BigNumber.from(value).toHexString()];
}

function formatDescription(value: Partial<Description>): Array<Uint8Array> {
  return [
    textEncoder.encode(value.name ?? ""),
    textEncoder.encode(value.identity ?? ""),
    textEncoder.encode(value.website ?? ""),
    textEncoder.encode(value.securityContact ?? ""),
    textEncoder.encode(value.details ?? ""),
  ];
}

function formatComissionRates(value: CommissionRate): Array<Array<string>> {
  return [formatDecimal(value.rate, "rate"), formatDecimal(value.maxRate, "maxRate"), formatDecimal(value.maxChangeRate, "maxChangeRate")];
}

function formatMsg(type: Directive, value: Msg): any {
  switch (type) {
    case Directive.CreateValidator: {
      const msg = value as CreateValidatorMsg;
      return [
        getAddress(msg.validatorAddress).checksum,
        formatDescription(msg.description),
        formatComissionRates(msg.commissionRates),
        formatNumber(msg.minSelfDelegation, "minSelfDelegation"),
        formatNumber(msg.maxTotalDelegation, "maxTotalDelegation"),
        msg.slotPubKeys.map((key) => arrayify(key)),
        msg.slotKeySigs.map((sig) => arrayify(sig)),
        formatNumber(msg.amount, "amount"),
      ];
    }
    case Directive.EditValidator: {
      const msg = value as EditValidatorMsg;
      return [
        getAddress(msg.validatorAddress).checksum,
        msg.description ? formatDescription(msg.description) : [],
        msg.commissionRate ? formatDecimal(msg.commissionRate, "commissionRate") : "0x",
        msg.minSelfDelegation ? formatNumber(msg.minSelfDelegation, "minSelfDelegation") : "0x",
        msg.maxTotalDelegation ? formatNumber(msg.maxTotalDelegation, "maxTotalDelegation") : "0x",
        msg.slotKeyToRemove ? hexlify(msg.slotKeyToRemove) : "0x",
        msg.slotKeyToAdd ? hexlify(msg.slotKeyToAdd) : "0x",
        msg.slotKeySig ? hexlify(msg.slotKeySig) : "0x",
        msg.active != null ? (msg.active ? One.toHexString() : Two.toHexString()) : Zero.toHexString(),
      ];
    }
    case Directive.Delegate:
    case Directive.Undelegate: {
      const msg = value as DelegateMsg | UndelegateMsg;
      return [getAddress(msg.delegatorAddress).checksum, getAddress(msg.validatorAddress).checksum, formatNumber(msg.amount, "amount")];
    }
    case Directive.CollectRewards: {
      const msg = value as CollectRewardsMsg;
      return [getAddress(msg.delegatorAddress).checksum];
    }
    default:
      logger.throwArgumentError("invalid type", "type", hexlify(type));
  }
}

export function serialize(transaction: UnsignedTransaction, signature?: SignatureLike): string {
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

export function serializeStakingTransaction(transaction: UnsignedTransaction, signature?: SignatureLike): string {
  const fields: any = [
    transaction.type === 0 ? "0x" : BigNumber.from(transaction.type).toHexString(),
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
      logger.throwArgumentError("invalid transaction.chainId", "transaction", transaction);
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

function handleDecimal(value: string): string {
  return value;
}

function handleText(value: string): string {
  return textDecoder.decode(arrayify(value));
}

function handleValidatorDescription(value: Array<string>): Description {
  return {
    name: handleText(value[0]),
    identity: handleText(value[1]),
    website: handleText(value[2]),
    securityContact: handleText(value[3]),
    details: handleText(value[4]),
  };
}

function handleValidatorCommissionRates(value: Array<string>): CommissionRate {
  return {
    rate: handleDecimal(value[0]),
    maxRate: handleDecimal(value[1]),
    maxChangeRate: handleDecimal(value[2]),
  };
}

function handleActive(value: string): boolean | null {
  const status = BigNumber.from(value);

  if (status.eq(Zero)) {
    return null;
  }

  if (status.eq(One)) {
    return true;
  }

  if (status.eq(Two)) {
    return false;
  }

  return null;
}

function handleMsg(type: Directive, value: Array<string | Array<string>>): Msg {
  switch (type) {
    case Directive.CreateValidator:
      return {
        validatorAddress: handleAddress(<string>value[0]),
        description: handleValidatorDescription(<Array<string>>value[1]),
        commissionRates: handleValidatorCommissionRates(<Array<string>>value[2]),
        minSelfDelegation: handleNumber(<string>value[3]),
        maxTotalDelegation: handleNumber(<string>value[4]),
        slotPubKeys: value[5],
        slotKeySigs: value[6],
        amount: handleNumber(<string>value[7]),
      } as CreateValidatorMsg;
    case Directive.EditValidator:
      return {
        validatorAddress: handleAddress(<string>value[0]),
        description: handleValidatorDescription(<Array<string>>value[1]),
        commissionRate: handleDecimal(<string>value[2]),
        minSelfDelegation: handleNumber(<string>value[3]),
        maxTotalDelegation: handleNumber(<string>value[4]),
        slotKeyToRemove: value[5],
        slotKeyToAdd: value[6],
        slotKeySig: value[7],
        active: handleActive(<string>value[8]),
      } as EditValidatorMsg;
    case Directive.Undelegate:
    case Directive.Delegate:
      return {
        delegatorAddress: handleAddress(<string>value[0]),
        validatorAddress: handleAddress(<string>value[1]),
        amount: handleNumber(<string>value[2]),
      } as DelegateMsg | UndelegateMsg;
    case Directive.CollectRewards:
      return {
        delegatorAddress: handleAddress(<string>value[0]),
      } as CollectRewardsMsg;
    default:
      logger.throwArgumentError("invalid type", "type", hexlify(type));
  }
}

function handleStakingTransaction(transaction: any): Transaction {
  // const transaction = RLP.decode(payload);

  if (transaction.length !== 5 && transaction.length !== 8) {
    logger.throwArgumentError("invalid component count for staking transaction", "payload", "");
  }

  const directive: Directive = transaction[0] === "0x" ? 0 : handleNumber(transaction[0]).toNumber();

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

    // chainId never zero in harmony?

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

export function parseStakingTransaction(payload: Uint8Array): Transaction {
  return handleStakingTransaction(RLP.decode(payload));
}

export function parse(rawTransaction: BytesLike): Transaction {
  const payload = arrayify(rawTransaction);
  // TODO: detect if is stakingTransaction without decoding
  const transaction = RLP.decode(payload);
  if (Array.isArray(transaction[1])) {
    return handleStakingTransaction(transaction);
  }

  return parseTransaction(payload);
}
