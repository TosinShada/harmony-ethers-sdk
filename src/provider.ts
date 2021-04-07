import {
  Block as BaseBlock,
  TransactionResponse,
  UrlJsonRpcProvider,
} from "@ethersproject/providers";
import { getStatic } from "@ethersproject/properties";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { hexlify } from "@ethersproject/bytes";
import { randomBytes } from "crypto";
import { Deferrable, resolveProperties } from "@ethersproject/properties";
import { Network, Networkish } from "@ethersproject/networks";
import { Logger } from "@ethersproject/logger";
import { TransactionRequest, Transaction } from "./transactions";
import HarmonyFormatter from "./formatter";
const logger = new Logger("hmy_provider/0.0.1");

function getLowerCase(value: string): string {
  if (value) {
    return value.toLowerCase();
  }
  return value;
}

export interface Block extends BaseBlock {
  shardId?: BigNumberish;
}

function timer(timeout: number): Promise<any> {
  return new Promise(function (resolve) {
    setTimeout(resolve, timeout);
  });
}

class HarmonyProvider extends UrlJsonRpcProvider {
  static shardId: number = 0;

  static getNetwork(network) {
    console.log({ network });
    return { name: "HarmonyOne", chainId: 2 };
  }

  static getApiKey(apiKey) {
    return apiKey;
  }

  static getUrl() {
    return HarmonyProvider.getShardingStructure()[HarmonyProvider.shardId].http;
  }

  static setShard(number: number) {
    this.shardId = number;
  }

  static getShardingStructure() {
    return [
      {
        http: "https://api.s0.b.hmny.io",
        shardID: 0,
        ws: "wss://ws.s0.b.hmny.io",
      },
      {
        http: "https://api.s1.b.hmny.io",
        shardID: 1,
        ws: "wss://ws.s1.b.hmny.io",
      },
      {
        http: "https://api.s2.b.hmny.io",
        shardID: 2,
        ws: "wss://ws.s2.b.hmny.io",
      },
      {
        http: "https://api.s3.b.hmny.io",
        shardID: 3,
        ws: "wss://ws.s3.b.hmny.io",
      },
    ];
  }

  static getFormatter(): HarmonyFormatter {
    return new HarmonyFormatter(HarmonyProvider.shardId);
  }

  formatter: HarmonyFormatter;

  constructor() {
    super();
    this._nextId = randomBytes(4).readUInt16BE(0);
  }

  async detectNetwork(): Promise<Network> {
    await timer(0);

    let chainId = null;
    try {
      chainId = await this.send("hmy_chainId", []);
    } catch (error) {
      try {
        chainId = await this.send("net_version", []);
      } catch (error) {}
    }

    if (chainId != null) {
      const getNetwork = getStatic<(network: Networkish) => Network>(
        this.constructor,
        "getNetwork"
      );
      try {
        return getNetwork(BigNumber.from(chainId).toNumber());
      } catch (error) {
        return logger.throwError(
          "could not detect network",
          Logger.errors.NETWORK_ERROR,
          {
            chainId: chainId,
            event: "invalidNetwork",
            serverError: error,
          }
        );
      }
    }

    return logger.throwError(
      "could not detect network",
      Logger.errors.NETWORK_ERROR,
      {
        event: "noNetwork",
      }
    );
  }

  async sendTransaction(
    signedTransaction: string | Promise<string>
  ): Promise<TransactionResponse> {
    await this.getNetwork();
    const hexTx = await Promise.resolve(signedTransaction).then((t) =>
      hexlify(t)
    );
    const tx = this.formatter.transaction(signedTransaction);

    if (tx.type && tx.msg) {
      try {
        const hash = await this.perform("sendStackingTransaction", {
          signedTransaction: hexTx,
        });
        return this._wrapTransaction(tx, hash);
      } catch (error) {
        (<any>error).transaction = tx;
        (<any>error).transactionHash = tx.hash;
        throw error;
      }
    }

    try {
      const hash = await this.perform("sendTransaction", {
        signedTransaction: hexTx,
      });
      return this._wrapTransaction(tx, hash);
    } catch (error) {
      (<any>error).transaction = tx;
      (<any>error).transactionHash = tx.hash;
      throw error;
    }
  }

  prepareRequest(method: string, params: any): [string, Array<any>] {
    console.log(this._nextId);
    switch (method) {
      case "getBlockNumber":
        return ["hmy_blockNumber", []];

      case "getGasPrice":
        return ["hmy_gasPrice", []];

      case "getBalance":
        return [
          "hmy_getBalance",
          [getLowerCase(params.address), params.blockTag],
        ];

      case "getTransactionCount":
        return [
          "hmy_getTransactionCount",
          [getLowerCase(params.address), params.blockTag],
        ];

      case "getCode":
        return ["hmy_getCode", [getLowerCase(params.address), params.blockTag]];

      case "getStorageAt":
        return [
          "hmy_getStorageAt",
          [getLowerCase(params.address), params.position, params.blockTag],
        ];

      case "sendTransaction":
        return ["hmy_sendRawTransaction", [params.signedTransaction]];

      case "sendStackingTransaction":
        return ["hmy_sendRawStakingTransaction", [params.signedTransaction]];

      case "getBlock":
        if (params.blockTag) {
          return [
            "hmy_getBlockByNumber",
            [params.blockTag, !!params.includeTransactions],
          ];
        } else if (params.blockHash) {
          return [
            "hmy_getBlockByHash",
            [params.blockHash, !!params.includeTransactions],
          ];
        }
        return null;

      case "getTransaction":
        return ["hmy_getTransactionByHash", [params.transactionHash]];

      case "getTransactionReceipt":
        return ["hmy_getTransactionReceipt", [params.transactionHash]];

      case "call": {
        const hexlifyTransaction = getStatic<
          (
            t: TransactionRequest,
            a?: { [key: string]: boolean }
          ) => { [key: string]: string }
        >(this.constructor, "hexlifyTransaction");
        return [
          "hmy_call",
          [
            hexlifyTransaction(params.transaction, { from: true }),
            params.blockTag,
          ],
        ];
      }

      case "estimateGas": {
        const hexlifyTransaction = getStatic<
          (
            t: TransactionRequest,
            a?: { [key: string]: boolean }
          ) => { [key: string]: string }
        >(this.constructor, "hexlifyTransaction");
        return [
          "hmy_estimateGas",
          [hexlifyTransaction(params.transaction, { from: true })],
        ];
      }

      case "getLogs":
        if (params.filter && params.filter.address != null) {
          params.filter.address = getLowerCase(params.filter.address);
        }
        return ["hmy_getLogs", [params.filter]];

      default:
        break;
    }

    return null;
  }

  async _getTransactionRequest(
    transaction: Deferrable<TransactionRequest>
  ): Promise<Transaction> {
    const values: any = await transaction;

    const tx: any = {};

    ["from", "to"].forEach((key) => {
      if (values[key] == null) {
        return;
      }
      tx[key] = Promise.resolve(values[key]).then((v) =>
        v ? this._getAddress(v) : null
      );
    });

    ["gasLimit", "gasPrice", "value"].forEach((key) => {
      if (values[key] == null) {
        return;
      }
      tx[key] = Promise.resolve(values[key]).then((v) =>
        v ? BigNumber.from(v) : null
      );
    });

    ["type"].forEach((key) => {
      if (values[key] == null) {
        return;
      }
      tx[key] = Promise.resolve(values[key]).then((v) =>
        v != null ? v : null
      );
    });

    if (values.accessList) {
      // tx.accessList = this.formatter.accessList(values.accessList);
    }

    ["data"].forEach((key) => {
      if (values[key] == null) {
        return;
      }
      tx[key] = Promise.resolve(values[key]).then((v) =>
        v ? hexlify(v) : null
      );
    });

    if (values?.type !== null && values.msg) {
      tx.msg = this.formatter.msg(values.type, values.msg);
    }

    return this.formatter.transactionRequest(await resolveProperties(tx));
  }
}

export default HarmonyProvider;
