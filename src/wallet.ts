import { getAddress } from "./address";
import { Wallet } from "@ethersproject/wallet";
import { Directive, TransactionRequest, serialize, UnsignedTransaction } from "./transactions";
import { resolveProperties, Deferrable, shallowCopy } from "@ethersproject/properties";
import { keccak256 } from "@ethersproject/keccak256";
import { formatUnits, parseUnits } from "@ethersproject/units";

import { Logger } from "@ethersproject/logger";
const logger = new Logger("hmy_wallet/0.0.1");

const allowedTransactionKeys: Array<string> = ["chainId", "data", "from", "gasLimit", "gasPrice", "nonce", "to", "type", "value", "msg"];

export default class HarmonyWallet extends Wallet {
  async getChainId(): Promise<number> {
    this._checkProvider("getChainId");
    const network = await this.provider.getNetwork();
    console.log({
      network,
    });
    return network.chainId;
  }

  async populateTransaction(transaction: Deferrable<TransactionRequest>): Promise<TransactionRequest> {
    const tx: Deferrable<TransactionRequest> = await resolveProperties(this.checkTransaction(transaction));

    if (tx.type != null) {
      // stake transaciton estimateGas possible?
      if (tx.gasPrice == null) {
        tx.gasPrice = parseUnits("100", 9);
      }

      if (tx.gasLimit == null) {
        tx.gasLimit = parseUnits("210000", 0);
      }
    }

    return super.populateTransaction(tx);
  }

  async signTransaction(transaction: TransactionRequest): Promise<string> {
    const tx = await resolveProperties(transaction);
    if (tx.from != null) {
      if (getAddress(tx.from).checksum !== this.address) {
        logger.throwArgumentError("transaction from address mismatch", "transaction.from", transaction.from);
      }
      delete tx.from;
    }

    const signature = this._signingKey().signDigest(keccak256(serialize(<UnsignedTransaction>tx)));

    return serialize(<UnsignedTransaction>tx, signature);
  }

  checkTransaction(transaction: Deferrable<TransactionRequest>): Deferrable<TransactionRequest> {
    for (const key in transaction) {
      if (allowedTransactionKeys.indexOf(key) === -1) {
        logger.throwArgumentError("invalid transaction key: " + key, "transaction", transaction);
      }
    }

    const tx = shallowCopy(transaction);

    if (tx.from == null) {
      tx.from = this.getAddress();
    } else {
      // Make sure any provided address matches this signer
      tx.from = Promise.all([Promise.resolve(tx.from), this.getAddress()]).then((result) => {
        if (result[0].toLowerCase() !== result[1].toLowerCase()) {
          logger.throwArgumentError("from address mismatch", "transaction", transaction);
        }
        return result[0];
      });
    }

    return tx;
  }
}
