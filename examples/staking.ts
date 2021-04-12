import { ExternallyOwnedAccount } from "@ethersproject/abstract-signer";
import { parseEther } from "@ethersproject/units";
import { ApiHarmonyProvider } from "../src/provider";
import { Directive, StakingTransactionRequest } from "../src/types";
import Wallet from "../src/wallet";

const account: ExternallyOwnedAccount = {
  address: "0x",
  privateKey: "0x",
};

async function main() {
  const provider = new ApiHarmonyProvider("https://api.s0.b.hmny.io");
  const wallet = new Wallet(account, provider);
  await provider.ready;

  const createValidator: StakingTransactionRequest = {
    type: Directive.CreateValidator,
    msg: {
      validatorAddress: wallet.address,
      amount: parseEther("10000"),
      commissionRates: {
        rate: "0.1",
        maxRate: "0.1",
        maxChangeRate: "0.01",
      },
      maxTotalDelegation: parseEther("1000000"),
      minSelfDelegation: parseEther("10000"),
      slotPubKeys: [],
      slotKeySigs: [],
      description: {
        name: "Test",
        identity: "Test",
        details: "Testing",
        securityContact: "test@test.com",
        website: "test.com",
      },
    },
  };

  const editValidator: StakingTransactionRequest = {
    type: Directive.EditValidator,
    msg: {
      validatorAddress: wallet.address,
      commissionRate: "0.09",
      // maxTotalDelegation: null,
      // minSelfDelegation: null,
      // slotKeySig: null,
      // slotKeyToAdd: null,
      // slotKeyToRemove: null,
      description: {
        name: "Test",
        identity: "test",
        details: "",
        securityContact: "test@test.com",
        website: "",
      },
      active: false,
    },
  };

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

  const res = await wallet.sendStakingTransaction(delegate);

  console.log({
    res,
  });
}

main();
