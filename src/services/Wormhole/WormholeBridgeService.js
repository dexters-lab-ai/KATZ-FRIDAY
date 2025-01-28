/****************************************************
 * WormholeBridgeService.js
 ****************************************************/
import { v4 as uuidv4 } from "uuid";
import {
  wormhole,
  Wormhole,
  routes,
  canonicalAddress
} from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import solana from "@wormhole-foundation/sdk/solana";
import { User } from "../../models/User.js";
import { getSigner } from "./helpers/index.js";

/**
 * chainMap
 * A small helper mapping user-friendly chain names -> Wormhole's internal naming
 * Update to "Mainnet" names or "Testnet" as needed
 */
const chainMap = {
  solana: "Solana",
  ethereum: "Ethereum",       // "Base" not yet supported
  avalanche: "Avalanche",   // or "AvalancheFuji"
};

/**
 * tokenSymbolMap
 * For each chain, we define known symbols => real addresses
 */
const tokenSymbolMap = {
    solana: {
      wSOL: "So11111111111111111111111111111111111111112",
      wETH: "someSPLwETHAddress",
      USDC: "someSPLusdcAddress"
    },
    ethereum: {
      wETH: "0x...", 
      USDC: "0x...",
    },
    avalanche: {
      wETH: "...",
      USDC: "...",
    }
};

export default class WormholeBridgeService {
  constructor() {
    this.wh = null;       // the Wormhole instance
    this.resolver = null; // route resolver
    this.initialized = false;
  }

  /**
   * initialize
   * ----------
   * Setup Wormhole with EVM & Solana. 
   */
  async initialize() {
    if (this.initialized) return;
    try {
      this.wh = await wormhole("Mainnet", [evm, solana]);
      this.resolver = this.wh.resolver([
        routes.TokenBridgeRoute,
        routes.AutomaticTokenBridgeRoute,
        routes.CCTPRoute,
        routes.AutomaticCCTPRoute,
        routes.AutomaticPorticoRoute
      ]);
      this.initialized = true;
      console.log("✅ WormholeBridgeService initialized for Mainnet");
    } catch (err) {
      console.error("❌ Error initializing WormholeBridgeService:", err.message);
      throw err;
    }
  }

  /**
   * bridgeTokens
   * ------------
   * A single, unified entry point that:
   * 1) Maps chain names
   * 2) Finds user & logs bridging in DB
   * 3) Resolves best route, quotes, initiates bridging
   * 4) Tracks bridging, updates DB
   * 5) Logs steps to Telegram & returns final result
   *
   * Expected arguments:
   * {
   *   telegramId,      // user telegram ID, required for storing bridging record in DB
   *   sourceChain,     // e.g. "solana", "base", "avalanche", "arbitrum"
   *   targetChain,     // same
   *   tokenAddress,    // "native" or actual address
   *   amount,          // decimal string
   *   recipientAddress // e.g. "0x123..." for EVM, base58 for Solana
   * }
   */
  async bridgeTokens(args, bot, chatId) {
    const {
      telegramId,
      sourceChain,
      targetChain,
      tokenAddress,
      amount,
      recipientAddress
    } = args;

    // 1) Basic checks
    if (!telegramId) {
      throw new Error("telegramId is required to store bridging receipts");
    }
    if (!sourceChain || !targetChain) {
      throw new Error(`Invalid chain input: ${sourceChain}, ${targetChain}`);
    }

    // 2) Initialize if needed
    await this.initialize();

    // 3) Map chain strings to Wormhole chain objects
    const srcChainName = chainMap[sourceChain];
    const dstChainName = chainMap[targetChain];
    if (!srcChainName || !dstChainName) {
      throw new Error(`Unsupported chain combination: ${sourceChain} -> ${targetChain}`);
    }
    const sendChain = this.wh.getChain(srcChainName);
    const destChain = this.wh.getChain(dstChainName);

    // 4) Load the user, create bridgingId, store bridging record in DB
    const user = await User.findByTelegramId(telegramId);
    if (!user) {
      throw new Error(`User not found for telegramId: ${telegramId}`);
    }

    const bridgingId = uuidv4();
    const bridgingRecord = {
      bridgingId,
      sourceChain,
      targetChain,
      tokenSymbol: tokenAddress,
      amount,
      status: "PENDING",
      logs: [`[${new Date().toISOString()}] Initiating bridging from ${sourceChain} to ${targetChain}...`],
    };
    await user.addBridgingRecord(bridgingRecord);

    // 5) Log to Telegram & DB
    await bot.sendMessage(
      chatId,
      `Bridging started. ID: ${bridgingId}\nFrom: ${sourceChain} -> ${targetChain}`
    );
    await user.addBridgingLog(bridgingId, "Resolving bridging route...");

    // 6) Get signers for source & destination
    const sender = await getSigner(sendChain);
    const receiver = await getSigner(destChain);

    // *** Resolve actual token address from symbolMap if needed ***
    let actualTokenAddr;
    if (tokenSymbol.toLowerCase() === "native") {
      actualTokenAddr = "native";
    } else if (tokenSymbolMap[sourceChain]?.[tokenSymbol]) {
      actualTokenAddr = tokenSymbolMap[sourceChain][tokenSymbol];
    } else {
      // We assume user passed a direct address if not in map
      actualTokenAddr = tokenSymbol;
    }

    // 7) Build wormhole tokenId
    let sendToken;
    if (actualTokenAddr === "native") {
      sendToken = Wormhole.tokenId(sendChain.chain, "native");
    } else {
      sendToken = Wormhole.tokenId(sendChain.chain, actualTokenAddr);
    }

    // 8) check destination tokens
    const destTokens = await this.resolver.supportedDestinationTokens(sendToken, sendChain, destChain);
    if (!destTokens.length) {
      throw new Error(`No bridging route found for tokenSymbol=${tokenSymbol} from ${sourceChain}->${targetChain}`);
    }
    const destinationToken = destTokens[0];

    // 9) Create RouteTransferRequest
    const tr = await routes.RouteTransferRequest.create(this.wh, {
      source: sendToken,
      destination: destinationToken
    });

    // 10) Find bridging routes
    const foundRoutes = await this.resolver.findRoutes(tr);
    if (!foundRoutes.length) {
      throw new Error("No bridging routes found for these parameters. Abort.");
    }
    // pick the first or sort them
    const bestRoute = foundRoutes[0];
    await bot.sendMessage(chatId, `Selecting best route: ${bestRoute.constructor.name}`);
    await user.addBridgingLog(bridgingId, `Best route: ${bestRoute.constructor.name}`);

    // 11) Validate & quote
    const transferParams = {
      amount,
      options: { nativeGas: 0 } // example
    };
    const validated = await bestRoute.validate(tr, transferParams);
    if (!validated.valid) throw validated.error;

    const quote = await bestRoute.quote(tr, validated.params);
    if (!quote.success) throw quote.error;
    const msgFees = `Quoted cost: ~${quote.estimate.fees} in fees, ~${quote.estimate.gas} gas.`;
    await bot.sendMessage(chatId, msgFees);
    await user.addBridgingLog(bridgingId, msgFees);

    // 12) Initiate bridging
    await bot.sendMessage(chatId, `Initiating bridging of ${amount} tokens now...`);
    const receipt = await bestRoute.initiate(tr, sender.signer, quote, receiver.address);
    const logMsg = `[${new Date().toISOString()}] Bridge initiated => ${JSON.stringify(receipt)}`;
    await user.addBridgingLog(bridgingId, logMsg);

    // store partial receipt
    await user.updateBridgingRecord(bridgingId, {
      routeUsed: bestRoute.constructor.name,
      txReceipt: { partial: receipt }
    });

    // 13) Wait for finalization
    // This performs an automatic "completeTransfer" if needed
    await routes.checkAndCompleteTransfer(bestRoute, receipt, receiver.signer);
    await user.addBridgingLog(bridgingId, `[${new Date().toISOString()}] checkAndCompleteTransfer done.`);

    // 14) Mark success in DB & telegram
    await user.updateBridgingRecord(bridgingId, {
      status: "COMPLETED",
      txReceipt: { final: "some final data" },
      completedAt: new Date()
    });
    await bot.sendMessage(chatId, `✅ Bridging completed. ID: ${bridgingId}`);

    // 15) Return final result
    return {
      bridgingId,
      success: true,
      message: `Bridged ${amount} of token [${tokenAddress}] from ${sourceChain} to ${targetChain}`
    };
  }
}
