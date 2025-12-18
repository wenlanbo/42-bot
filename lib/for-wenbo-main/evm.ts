import { createPublicClient, http, parseAbi } from "viem";
import { bsc } from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

export const COLLATERAL_ADDRESS = "0x63c8e89a56f2C4e4ad5Ec26228621Fa04c33E4F0";

export const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

export const PUBLIC_CLIENT = createPublicClient({
  chain: bsc,
  transport: process.env.NEXT_PUBLIC_RPC_URL
    ? http(process.env.NEXT_PUBLIC_RPC_URL)
    : http(),
});
