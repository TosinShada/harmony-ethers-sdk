import { parseEther } from "@ethersproject/units";
import { ExternallyOwnedAccount } from "@ethersproject/abstract-signer";
import HarmonyProvider from "./src/provider";
import { Directive, TransactionRequest } from "./src/transactions";
import Wallet from "./src/wallet";

const account: ExternallyOwnedAccount = {
  address: "0x",
  privateKey: "0x",
};

async function main() {
  HarmonyProvider.setShard(Number(0));
  const provider = new HarmonyProvider();
  const wallet = new Wallet(account, provider);
  await provider.ready;

  const tx: TransactionRequest = {
    type: Directive.Delegate,
    msg: {
      delegatorAddress: wallet.address,
      validatorAddress: "one1xjanr7lgulc0fqyc8dmfp6jfwuje2d94xfnzyd",
      amount: parseEther("1000"),
    },
  };

  const request = await provider._getTransactionRequest(tx);

  const signedTx = await wallet.signTransaction(
    await wallet.populateTransaction(tx)
  );

  console.log({
    request,
    signedTx,
  });

  const res = await wallet.sendTransaction(tx);

  console.log({
    res,
  });
}

main();
