import { ExternallyOwnedAccount } from "@ethersproject/abstract-signer";
import { ApiHarmonyProvider } from "../src/provider";
import Wallet from "../src/wallet";

const account: ExternallyOwnedAccount = {
  address: "0x",
  privateKey: "0x",
};

async function main() {
  ApiHarmonyProvider.setShard(0);
  const provider = new ApiHarmonyProvider();
  const wallet = new Wallet(account, provider);
  await provider.ready;

  // const block = await provider.getBlock(8_104_657);
  const blockWithTransactions = await provider.getBlockWithTransactions(8_084_324);

  console.dir(blockWithTransactions, {
    depth: Infinity,
  });
}

main();
