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

import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import Head from "next/head";
import {
  chainToUrl,
  abbreviateTransactionHash,
  BACKEND_URL,
  sendTransaction,
  sendOrder,
  waitForOrderStatus,
} from "../util/utils";
import { ethers } from "ethers";
import { OrderStatus } from "@cowprotocol/cow-sdk";

export default function DashboardPage() {
  const [intentValue, setIntentValue] = useState<string>("");
  const [status, setStatus] = useState<React.ReactNode>(<></>);
  const [showStatusPopup, setShowStatusPopup] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const router = useRouter();
  const { ready, authenticated, logout } = usePrivy();

  useEffect(() => {
    if (ready && !authenticated) {
      void router.push("/");
    }
  }, [ready, authenticated, router]);

  const { wallets } = useWallets();
  const queryIntent = async () => {
    let data: any;
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}answer/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: intentValue }),
      });
      if (!response.ok) {
        throw new Error("Network response was not ok!");
      }
      data = await response.json();
    } catch (error) {
      console.error("Failed to fetch:", error);
      setStatus(<div>Failed to query intent due to an error!</div>);
      setShowStatusPopup(true);
      setLoading(false);
      return;
    }

    if (data.transaction_type === "transfer") {
      const { recipientAddress, chain, amount, token } = data.response;
      try {
        const tx: ethers.providers.TransactionResponse = await sendTransaction(
          wallets,
          recipientAddress,
          amount.toString(),
          chain,
          token
        );
        setStatus(
          <div style={{ textAlign: "center" }}>
            Transfer sent! Awaiting Confirmation ⌛<br />
            <br />
            View on Explorer:{" "}
            <a
              className="text-blue-500 hover:text-blue-700"
              href={`${chainToUrl[chain]}${tx.hash}`}
            >
              {abbreviateTransactionHash(tx.hash)}
            </a>
          </div>
        );
        setShowStatusPopup(true);

        const receipt = await tx.wait(1);

        setStatus(
          <div style={{ textAlign: "center" }}>
            Transfer confirmed! 🎉
            <br />
            <br />
            View on Explorer:{" "}
            <a
              className="text-blue-500 hover:text-blue-700"
              href={`${chainToUrl[chain]}${receipt.transactionHash}`}
            >
              {abbreviateTransactionHash(receipt.transactionHash)}
            </a>
          </div>
        );
        setLoading(false);
      } catch (error) {
        console.error("Transfer failed:", error);
        setStatus(<div>Oops! Something went wrong</div>);
        setShowStatusPopup(true);
        setLoading(false);
      }
    } else if (data.transaction_type === "swap") {
      const { chain, amount, fromAsset, toAsset } = data.response;
      try {
        const orderId = await sendOrder(
          wallets,
          chain,
          fromAsset,
          toAsset,
          amount.toString()
        );
        setStatus(
          <div style={{ textAlign: "center" }}>
            Order sent! Your order is being filled ⌛
          </div>
        );
        setShowStatusPopup(true);

        const orderStatus = await waitForOrderStatus(orderId, chain);
        setStatus(
          orderStatus === OrderStatus.FULFILLED ? (
            <div>Order filled! 🎉</div>
          ) : (
            <div>Uh oh! Something went wrong! Order status: ${orderStatus}</div>
          )
        );
        setLoading(false);
      } catch (error) {
        console.error("Swap failed:", error);
        setStatus(
          <div style={{ textAlign: "center" }}>Oops! Something went wrong</div>
        );
        setShowStatusPopup(true);
        setLoading(false);
      }
    }
  };

  return (
    <>
      <Head>
        <title>Txt-2-Tx</title>
      </Head>

      <main className="flex flex-col items-center justify-center min-h-screen px-4 sm:px-20 bg-[#C0C0C0] text-[#000000] font-mono">
        {ready && authenticated && (
          <div className="bg-white p-8 rounded-md shadow-md border-[#808080] border-2 w-full max-w-2xl">
            <div className="flex flex-row justify-between w-full items-start mb-4">
              <div className="flex flex-row items-center">
                <div className="w-4 h-4 rounded-full bg-[#FF0000] mr-2"></div>
                <div className="w-4 h-4 rounded-full bg-[#FFFF00] mr-2"></div>
                <div className="w-4 h-4 rounded-full bg-[#00FF00] mr-2"></div>
              </div>
              <button
                onClick={logout}
                className="text-sm bg-[#C0C0C0] hover:bg-[#A0A0A0] py-2 px-4 text-[#000000] border-[#808080] border-2 rounded-md"
              >
                Logout
              </button>
            </div>

            {showStatusPopup ? (
              <div className="flex flex-col items-center justify-between">
                {status}
                <div className="flex flex-row items-center mt-4">
                  <button
                    onClick={() => setShowStatusPopup(false)}
                    className="text-sm bg-[#C0C0C0] hover:bg-[#A0A0A0] py-2 px-4 text-[#000000] border-[#808080] border-2 rounded-md"
                  >
                    OK
                  </button>
                </div>
              </div>
            ) : (
              <>
                <textarea
                  value={intentValue}
                  onChange={(e) => setIntentValue(e.target.value)}
                  placeholder="Enter your heart's desire. Currently supports transfers and swaps."
                  className="text-sm py-2 px-4 bg-white border-[#808080] w-full h-24 resize-none my-8 rounded-md shadow-md"
                />
                <button
                  onClick={queryIntent}
                  className={`text-sm bg-[#C0C0C0] hover:bg-[#A0A0A0] py-2 px-4 text-[#000000] border-[#808080] border-2 rounded-md w-32 ${
                    loading ? "cursor-not-allowed" : ""
                  }`}
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Submit"}
                </button>
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}
