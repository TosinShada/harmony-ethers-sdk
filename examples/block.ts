import { ApiHarmonyProvider } from "../src/provider";
async function main() {
  const provider = new ApiHarmonyProvider("https://api.s0.b.hmny.io");

  // a block with staking transaction
  const block = await provider.getBlockWithTransactions(8_202_681);
  console.dir(block, {
    depth: Infinity,
  });
}

main();
