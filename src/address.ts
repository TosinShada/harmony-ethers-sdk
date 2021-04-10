import { isAddress, getAddress as getHexAddress } from "@ethersproject/address";
import { arrayify, hexlify } from "@ethersproject/bytes";
import { bech32 } from "bech32";

// HRP is the human-readable part of Harmony bech32 addresses
export const HRP = "one";
export const tHRP = "tone";

export const isBech32Address = (raw: string): boolean => {
  return !!raw.match(/^one1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}/);
};

export const isBech32TestNetAddress = (raw: string): boolean => {
  return !!raw.match(/^tone1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}/);
};

export class HarmonyAddress {
  static isValidBasic(str: string) {
    const toTest = new HarmonyAddress(str);
    return toTest.raw === toTest.basic;
  }

  static isValidChecksum(str: string) {
    const toTest = new HarmonyAddress(str);
    return toTest.raw === toTest.checksum;
  }

  static isValidBech32(str: string) {
    const toTest = new HarmonyAddress(str);
    return toTest.raw === toTest.bech32;
  }

  static isValidBech32TestNet(str: string) {
    const toTest = new HarmonyAddress(str);
    return toTest.raw === toTest.bech32TestNet;
  }

  raw: string;
  basic: string;

  get basicHex() {
    return hexlify(this.basic);
  }

  get checksum() {
    return getHexAddress(this.basic);
  }

  get bech32() {
    return bech32.encode(HRP, bech32.toWords(arrayify(this.basic)));
  }

  get bech32TestNet() {
    return bech32.encode(tHRP, bech32.toWords(arrayify(this.basic)));
  }

  constructor(raw: string) {
    this.raw = raw;
    this.basic = this.getBasic(this.raw);
  }

  private getBasic(addr: string) {
    if (isAddress(addr)) {
      return getHexAddress(addr).substring(2);
    }

    if (isBech32Address(addr) || isBech32TestNetAddress(addr)) {
      const { prefix, words } = bech32.decode(addr);
      if (prefix === HRP || prefix === tHRP) {
        return getHexAddress(hexlify(bech32.fromWords(words))).substring(2);
      }
    }

    throw new Error(`"${addr}" is an invalid address format`);
  }
}

export function getAddress(address: string) {
  try {
    return new HarmonyAddress(address);
  } catch (error) {
    throw error;
  }
}
