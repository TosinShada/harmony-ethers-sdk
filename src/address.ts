import { isAddress, getAddress as getHexAddress } from "@ethersproject/address";
import { arrayify, hexlify, hexValue } from "@ethersproject/bytes";
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
  /**
   * @example
   * ```
   * const addr = 'one103q7qe5t2505lypvltkqtddaef5tzfxwsse4z7'
   * const res = HarmonyAddress.isValidBech32(addr);
   * console.log(res);
   * ```
   */
  static isValidBasic(str: string) {
    const toTest = new HarmonyAddress(str);
    return toTest.raw === toTest.basic;
  }

  /**
   * @example
   * ```
   * const addr = 'one103q7qe5t2505lypvltkqtddaef5tzfxwsse4z7'
   * const res = HarmonyAddress.isValidChecksum(addr);
   * console.log(res);
   * ```
   */
  static isValidChecksum(str: string) {
    const toTest = new HarmonyAddress(str);
    return toTest.raw === toTest.checksum;
  }

  /**
   * @example
   * ```
   * const addr = 'one103q7qe5t2505lypvltkqtddaef5tzfxwsse4z7'
   * const res = HarmonyAddress.isValidBech32(addr);
   * console.log(res);
   * ```
   */
  static isValidBech32(str: string) {
    const toTest = new HarmonyAddress(str);
    return toTest.raw === toTest.bech32;
  }

  /**
   * @example
   * ```
   * const addr = 'one103q7qe5t2505lypvltkqtddaef5tzfxwsse4z7'
   * const res = HarmonyAddress.isValidBech32TestNet(addr);
   * console.log(res);
   * ```
   */
  static isValidBech32TestNet(str: string) {
    const toTest = new HarmonyAddress(str);
    return toTest.raw === toTest.bech32TestNet;
  }

  raw: string;
  basic: string;

  /**
   * get basicHex of the address
   *
   * @example
   * ```
   * const addr = 'one103q7qe5t2505lypvltkqtddaef5tzfxwsse4z7'
   * const instance = new HarmonyAddress(addr);
   * console.log(instance.basicHex);
   * ```
   */
  get basicHex() {
    return hexlify(this.basic);
  }

  /**
   * @example
   * ```
   * const addr = 'one103q7qe5t2505lypvltkqtddaef5tzfxwsse4z7'
   * const instance = new HarmonyAddress(addr);
   * console.log(instance.checksum);
   * ```
   */
  get checksum() {
    return getHexAddress(this.basic);
  }

  /**
   * @example
   * ```
   * const addr = 'one103q7qe5t2505lypvltkqtddaef5tzfxwsse4z7'
   * const instance = new HarmonyAddress(addr);
   * console.log(instance.bech32);
   * ```
   */
  get bech32() {
    return bech32.encode(HRP, bech32.toWords(arrayify(this.basic)));
  }

  /**
   * @example
   * ```
   * const addr = 'one103q7qe5t2505lypvltkqtddaef5tzfxwsse4z7'
   * const instance = new HarmonyAddress(addr);
   * console.log(instance.bech32TestNet);
   * ```
   */
  get bech32TestNet() {
    return bech32.encode(tHRP, bech32.toWords(arrayify(this.basic)));
  }

  constructor(raw: string) {
    this.raw = raw;
    this.basic = this.getBasic(this.raw);
  }

  /**
   * Check whether the address has an valid address format
   *
   * @param addr string, the address
   *
   * @example
   * ```
   * const addr = 'one103q7qe5t2505lypvltkqtddaef5tzfxwsse4z7'
   * const instance = new HarmonyAddress(addr);
   * const res = instance.getBasic(addr);
   * console.log(res)
   * ```
   */
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

/**
 * Using this function to get Harmony format address
 *
 * @param address
 *
 * @example
 * ```javascript
 * const { Harmony } = require('@harmony-js/core');
 * const { ChainID, ChainType } = require('@harmony-js/utils');
 * const { randomBytes } = require('@harmony-js/crypto')
 *
 * const hmy = new Harmony(
 *   'http://localhost:9500',
 *   {
 *   chainType: ChainType.Harmony,
 *   chainId: ChainID.HmyLocal,
 *   },
 * );
 *
 * const bytes = randomBytes(20);
 * const hAddress = hmy.crypto.getAddress(bytes);
 * console.log(hAddress)
 * ```
 */

export function getAddress(address: string) {
  try {
    return new HarmonyAddress(address);
  } catch (error) {
    throw error;
  }
}
