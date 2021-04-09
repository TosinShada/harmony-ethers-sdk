import { UrlJsonRpcProvider, BlockTag } from "@ethersproject/providers";
import { getStatic } from "@ethersproject/properties";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { hexlify } from "@ethersproject/bytes";
import { randomBytes } from "crypto";
import { Deferrable, resolveProperties } from "@ethersproject/properties";
import { Network, Networkish } from "@ethersproject/networks";
import { TransactionReceipt } from "@ethersproject/abstract-provider";
import { Logger } from "@ethersproject/logger";
import { TransactionRequest, Transaction, TransactionResponse } from "./transactions";
import HarmonyFormatter from "./formatter";
const logger = new Logger("hmy_provider/0.0.1");

interface BlockBase {
  hash: string;
  parentHash: string;
  number: number;

  timestamp: number;
  nonce: string;
  difficulty: number;

  gasLimit: BigNumber;
  gasUsed: BigNumber;

  miner: string;
  extraData: string;

  // Harmony

  epoch: BigNumberish;
  shardID: BigNumberish;
  viewID: string;

  transactions: Array<string | TransactionResponse>;
  stakingTransactions: Array<string | TransactionResponse>;
}

export interface Block extends BlockBase {
  transactions: Array<string>;
  stakingTransactions: Array<string>;
}

export interface BlockWithTransactions extends BlockBase {
  transactions: Array<TransactionResponse>;
  stakingTransactions: Array<TransactionResponse>;
}

function timer(timeout: number): Promise<any> {
  return new Promise(function (resolve) {
    setTimeout(resolve, timeout);
  });
}

interface HarmonyProvider {
  // Execution
  sendTransaction(signedTransaction: string | Promise<string>): Promise<TransactionResponse>;
  // sendStakeTransaction(signedTransaction: string | Promise<string>): Promise<TransactionRequest>;

  call(transaction: Deferrable<TransactionRequest>, blockTag?: BlockTag | Promise<BlockTag>): Promise<string>;
  estimateGas(transaction: Deferrable<TransactionRequest>): Promise<BigNumber>;

  // Queries
  getBlock(blockHashOrBlockTag: BlockTag | string | Promise<BlockTag | string>): Promise<Block>;
  getBlockWithTransactions(blockHashOrBlockTag: BlockTag | string | Promise<BlockTag | string>): Promise<BlockWithTransactions>;

  // getTransaction(transactionHash: string): Promise<TransactionResponse>;
  // getTransactionReceipt(transactionHash: string): Promise<TransactionReceipt>;

  // getStakeTransaction(transactionHash: string): Promise<TransactionResponse>;
  // getCXReceipt(transactionHash: string): Promise<TransactionResponse>;

  // getCirculatingSupply(): Promise<number>;
  // getTotalSupply(): Promise<number>;

  // getStakingNetworkInfo(): Promise<>;

  // getValidators(epochNumber: number);

  // getValidatorsAddresses(); Promise<Array<string>>;
  // getActiveValidatorsAddresses(); Promise<Array<string>>;
  // getValidator(validatorAddress: string);
  // getValidatorMetrics(validatorAddress: string);

  // getMedianStake()

  // getValidatorSignedBlocks(validatorAddress: string);

  // getBlockSigners(blockNumber: BlockTag)
  // isBlockSigner(blockNumber: BlockTag, validatorAddress: string)
}

export class ApiHarmonyProvider extends UrlJsonRpcProvider implements HarmonyProvider {
  static shardId: number = 0;

  static getNetwork(network) {
    console.log({ network });
    return { name: "HarmonyOne", chainId: 2 };
  }

  static getApiKey(apiKey) {
    return apiKey;
  }

  static getUrl() {
    return ApiHarmonyProvider.getShardingStructure()[ApiHarmonyProvider.shardId].http;
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

  static getShard() {
    return this.shardId;
  }

  static getFormatter(): HarmonyFormatter {
    return new HarmonyFormatter(ApiHarmonyProvider.shardId);
  }

  formatter: HarmonyFormatter;

  constructor() {
    super();
    this._nextId = randomBytes(1).readUInt8();
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
      const getNetwork = getStatic<(network: Networkish) => Network>(this.constructor, "getNetwork");
      try {
        return getNetwork(BigNumber.from(chainId).toNumber());
      } catch (error) {
        return logger.throwError("could not detect network", Logger.errors.NETWORK_ERROR, {
          chainId: chainId,
          event: "invalidNetwork",
          serverError: error,
        });
      }
    }

    return logger.throwError("could not detect network", Logger.errors.NETWORK_ERROR, {
      event: "noNetwork",
    });
  }

  async sendTransaction(signedTransaction: string | Promise<string>): Promise<TransactionResponse> {
    await this.getNetwork();

    const hexTx = hexlify(await Promise.resolve(signedTransaction));
    const tx = this.formatter.transaction(signedTransaction);

    try {
      const method = tx.type != null ? "sendStackingTransaction" : "sendTransaction";
      const hash = await this.perform(method, {
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
      case "sendStackingTransaction":
        return ["hmy_sendRawStakingTransaction", [params.signedTransaction]];
      default:
        let [rpcMethod, rpcParams] = super.prepareRequest(method, params);

        if (rpcMethod.startsWith("eth")) {
          rpcMethod = rpcMethod.replace("eth", "hmy");
        }

        return [rpcMethod, rpcParams];
    }
  }

  async _getTransactionRequest(transaction: Deferrable<TransactionRequest>): Promise<Transaction> {
    const values: any = await transaction;

    const tx: any = {};

    ["from", "to"].forEach((key) => {
      if (values[key] == null) {
        return;
      }
      tx[key] = Promise.resolve(values[key]).then((v) => (v ? this._getAddress(v) : null));
    });

    ["gasLimit", "gasPrice", "value"].forEach((key) => {
      if (values[key] == null) {
        return;
      }
      tx[key] = Promise.resolve(values[key]).then((v) => (v ? BigNumber.from(v) : null));
    });

    ["type"].forEach((key) => {
      if (values[key] == null) {
        return;
      }
      tx[key] = Promise.resolve(values[key]).then((v) => (v != null ? v : null));
    });

    ["data"].forEach((key) => {
      if (values[key] == null) {
        return;
      }
      tx[key] = Promise.resolve(values[key]).then((v) => (v ? hexlify(v) : null));
    });

    if (values?.type !== null && values.msg) {
      tx.msg = this.formatter.msg(values.type, values.msg);
    }

    return this.formatter.transactionRequest(await resolveProperties(tx));
  }

  async _getBlock(
    blockHashOrBlockTag: BlockTag | string | Promise<BlockTag | string>,
    includeTransactions?: boolean
  ): Promise<Block | BlockWithTransactions> {
    const block = (await super._getBlock(blockHashOrBlockTag, includeTransactions)) as Block | BlockWithTransactions;

    if (includeTransactions) {
      let blockNumber: number = null;
      for (let i = 0; i < (<BlockWithTransactions>block).stakingTransactions.length; i++) {
        const tx = (<BlockWithTransactions>block).stakingTransactions[i];
        if (tx.blockNumber == null) {
          tx.confirmations = 0;
        } else if (tx.confirmations == null) {
          if (blockNumber == null) {
            blockNumber = await this._getInternalBlockNumber(100 + 2 * this.pollingInterval);
          }

          // Add the confirmations using the fast block number (pessimistic)
          let confirmations = blockNumber - tx.blockNumber + 1;
          if (confirmations <= 0) {
            confirmations = 1;
          }
          tx.confirmations = confirmations;
        }
      }

      return this.formatter.blockWithTransactions(block);
    }

    return block;
  }

  getBlock(blockHashOrBlockTag: BlockTag | string | Promise<BlockTag | string>): Promise<Block> {
    return <Promise<Block>>this._getBlock(blockHashOrBlockTag, false);
  }

  getBlockWithTransactions(blockHashOrBlockTag: BlockTag | string | Promise<BlockTag | string>): Promise<BlockWithTransactions> {
    return <Promise<BlockWithTransactions>>this._getBlock(blockHashOrBlockTag, true);
  }
}
