import { ApiHarmonyProvider } from "../src/provider";
import { ExternallyOwnedAccount } from "@ethersproject/abstract-signer";
import { parseEther } from "@ethersproject/units";
import Wallet from "../src/wallet";

const account: ExternallyOwnedAccount = {
  address: "0x",
  privateKey: "0x",
};

async function main() {
  const provider = new ApiHarmonyProvider("https://api.s0.b.hmny.io");
  const wallet = new Wallet(account, provider);
  await provider.ready;

  // cross shard transaction
  const tx = await wallet.sendTransaction({
    to: wallet.address,
    toShardID: 1,
    value: parseEther("10"),
  });

  console.log({
    tx,
  });
}

main();
