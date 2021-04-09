import { parseEther } from "@ethersproject/units";
import { ExternallyOwnedAccount } from "@ethersproject/abstract-signer";
import { ApiHarmonyProvider } from "../src/provider";
import { Directive, StakingTransactionRequest } from "../src/transactions";
import Wallet from "../src/wallet";

const account: ExternallyOwnedAccount = {
  address: "0x",
  privateKey: "0",
};

async function main() {
  ApiHarmonyProvider.setShard(0);
  const provider = new ApiHarmonyProvider();
  const wallet = new Wallet(account, provider);
  await provider.ready;

  const delegate: StakingTransactionRequest = {
    type: Directive.Delegate,
    msg: {
      delegatorAddress: wallet.address,
      validatorAddress: "one1xjanr7lgulc0fqyc8dmfp6jfwuje2d94xfnzyd",
      amount: parseEther("1000"),
    },
  };

  const undelegate: StakingTransactionRequest = {
    type: Directive.Undelegate,
    msg: {
      delegatorAddress: wallet.address,
      validatorAddress: "one1xjanr7lgulc0fqyc8dmfp6jfwuje2d94xfnzyd",
      amount: parseEther("1000"),
    },
  };

  const collectRewards: StakingTransactionRequest = {
    type: Directive.CollectRewards,
    msg: {
      delegatorAddress: wallet.address,
    },
  };

  const res = await wallet.sendTransaction(delegate);

  console.log({
    res,
  });
}

main();
