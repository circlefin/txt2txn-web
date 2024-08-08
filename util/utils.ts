/**
 * Copyright (c) 2024 Blockchain at Berkeley.  All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * SPDX-License-Identifier: MIT
 */

import { ethers } from "ethers";
import { ConnectedWallet } from "@privy-io/react-auth";
import {
  OrderBookApi,
  OrderSigningUtils,
  SupportedChainId,
  OrderQuoteSideKindSell,
  SigningScheme,
  COW_PROTOCOL_VAULT_RELAYER_ADDRESS,
  OrderQuoteRequest,
  OrderStatus,
} from "@cowprotocol/cow-sdk";
type Address = string;

const decimalConverter: { [key: number]: { [key: string]: number } } = {
  11155111: {
    // sepolia
    "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238": 6, // testnet USDC
    "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4": 6, // testnet EURC
    "0xB4F1737Af37711e9A5890D9510c9bB60e170CB0D": 18, // cowswap test DAI
    "0xbe72E441BF55620febc26715db68d3494213D8Cb": 18, // cowswap test USDC
  },
  1: {
    // mainnet
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": 18, // WETH
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": 6, // USDC
    "0x6B175474E89094C44Da98b954EedeAC495271d0F": 18, // DAI
  },
};

export const chainToUrl: Record<string, string> = {
  sepolia: "https://sepolia.etherscan.io/tx/",
  base: "https://basescan.org/tx/",
  mainnet: "https://etherscan.io/tx",
};

const supportedChains: { [key: string]: number } = {
  sepolia: 11155111,
  mainnet: 1,
  base: 8453,
};

// Free mainnet RPC, used for ENS resolution
const mainnetProvider = new ethers.providers.JsonRpcProvider(
  "https://rpc.ankr.com/eth"
);

const ERC20_ABI = [
  // Read-Only Functions
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",

  // Authenticated Functions
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 value) returns (bool)",

  // Events
  "event Transfer(address indexed from, address indexed to, uint amount)",
];

// Helper function to check allowance and submit an approval if necessary
async function checkAllowanceAndApproveIfNecessary(
  targetContract: string,
  tokenContract: string,
  signer: ethers.providers.JsonRpcSigner,
  requiredAmount: ethers.BigNumber
): Promise<void> {
  const sellTokenContract = new ethers.Contract(
    tokenContract,
    ERC20_ABI,
    signer
  );
  console.log(sellTokenContract);

  const existingAllowance: ethers.BigNumber = await sellTokenContract.allowance(
    await signer.getAddress(),
    targetContract
  );
  const sellAmountBn = ethers.BigNumber.from(requiredAmount);
  if (existingAllowance.gte(sellAmountBn)) {
    console.log("existing allowance is sufficient");
  } else {
    const sellTokenSigner = sellTokenContract.connect(signer);
    const tx = await await sellTokenSigner.approve(
      targetContract,
      ethers.constants.MaxUint256
    );
    console.log("Sending approval transaction...");
    // Waiting for the transaction to be mined
    const receipt = await tx.wait();
    // The transaction is now on chain!
    console.log(`Approval finalized in block ${receipt.blockNumber}`);
  }
}

export const abbreviateTransactionHash = (hash: string) => {
  if (!hash) return "";
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
};

export const BACKEND_URL = "http://localhost:8000/";

/**
 * Asynchronously waits for the specified number of milliseconds.
 * @param ms - The number of milliseconds to wait.
 * @returns {Promise<void>} - A Promise that resolves after the specified time.
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

export async function sendTransaction(
  wallets: ConnectedWallet[],
  receiver: Address,
  amount: string,
  chain: string,
  erc20ContractAddress: Address
): Promise<ethers.providers.TransactionResponse> {
  if (!wallets[0]) {
    throw new Error("No wallet is connected!");
  }

  const chainId = supportedChains[chain];
  if (chainId === undefined) {
    throw new Error("Unsupported chain");
  }

  await wallets[0].switchChain(chainId);
  const provider = await wallets[0].getEthersProvider();
  const signer = provider.getSigner();

  const contract = new ethers.Contract(erc20ContractAddress, ERC20_ABI, signer);

  const chainDecimals = decimalConverter[chainId];
  if (chainDecimals === undefined) {
    throw new Error(`No decimals for chain: ${chain}`);
  }

  const decimals = chainDecimals[erc20ContractAddress];
  if (decimals === undefined) {
    throw new Error(`No decimals for token: ${erc20ContractAddress}`);
  }

  const amount_decimals = ethers.utils.parseUnits(amount, decimals);
  const contractSigner = contract.connect(signer);

  let receiverAddress = receiver;

  // check if ENS
  if (!ethers.utils.isAddress(receiver)) {
    const resolvedName = await mainnetProvider.resolveName(receiver);
    if (resolvedName === null) {
      throw new Error("Could not resolve ENS name");
    }
    receiverAddress = resolvedName;
  }
  console.log("Sending transaction...");
  const tx = await contractSigner.transfer(receiverAddress, amount_decimals);
  return tx;
}

export async function sendOrder(
  wallets: ConnectedWallet[],
  chain: string,
  fromAsset: string,
  toAsset: string,
  amount: string
): Promise<string> {
  const chainId = supportedChains[chain];
  if (chainId === undefined) {
    throw new Error("Unsupported chain");
  }

  if (!wallets[0]) {
    throw new Error("No wallet is connected!");
  }

  await wallets[0].switchChain(chainId);

  const provider = await wallets[0].getEthersProvider();
  const signer = provider.getSigner();
  const fromAddress = await signer.getAddress();

  const chainDecimals = decimalConverter[chainId];
  if (chainDecimals === undefined) {
    throw new Error(`No decimals for chain: ${chain}`);
  }

  const decimals = chainDecimals[fromAsset];
  if (decimals === undefined) {
    throw new Error(`No decimals for token: ${fromAsset}`);
  }

  const amountDecimals = ethers.utils.parseUnits(amount, decimals).toString();
  const slippage = 0.05;

  const quoteRequest: OrderQuoteRequest = {
    sellToken: fromAsset,
    buyToken: toAsset,
    from: fromAddress,
    receiver: fromAddress,
    sellAmountBeforeFee: amountDecimals,
    kind: OrderQuoteSideKindSell.SELL,
  };

  const vaultAddr =
    COW_PROTOCOL_VAULT_RELAYER_ADDRESS[chainId as SupportedChainId];
  await checkAllowanceAndApproveIfNecessary(
    vaultAddr,
    fromAsset,
    signer,
    ethers.BigNumber.from(amountDecimals)
  );

  const orderBookApi = new OrderBookApi({ chainId: chainId });
  const { quote, ...quoteParams } = await orderBookApi.getQuote(quoteRequest);

  quote.feeAmount = "0";
  quote.sellAmount = amountDecimals;
  quote.buyAmount = Math.round(
    Number(quote.buyAmount) * (1 - slippage)
  ).toString();

  const orderSigningResult = await OrderSigningUtils.signOrder(
    { ...quote, receiver: fromAddress },
    chainId,
    signer
  );

  const orderObj = {
    ...quote,
    ...orderSigningResult,
    signingScheme: SigningScheme.EIP712,
    quoteId: quoteParams.id,
    from: fromAddress,
  };

  return await orderBookApi.sendOrder(orderObj);
}

export async function waitForOrderStatus(
  orderId: string,
  chain: string
): Promise<OrderStatus> {
  const chainId = supportedChains[chain];
  if (chainId === undefined) {
    throw new Error("Unsupported chain");
  }

  const orderBookApi = new OrderBookApi({ chainId: chainId });
  let orderStatus: OrderStatus = OrderStatus.OPEN;
  while (orderStatus == OrderStatus.OPEN) {
    // wait three seconds
    await sleep(3000);
    const enrichedOrder = await orderBookApi.getOrder(orderId);
    orderStatus = enrichedOrder.status;
  }
  return orderStatus;
}
