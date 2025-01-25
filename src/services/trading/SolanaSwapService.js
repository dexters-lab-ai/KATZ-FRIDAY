import {
    Keypair, Connection, PublicKey, VersionedTransaction,
    LAMPORTS_PER_SOL, TransactionInstruction, TransactionMessage
} from "@solana/web3.js";
import JupiterApi from '@jup-ag/api'; // Fix: Default import for CommonJS module
import { TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";
import dotenv from "dotenv";
import * as fs from 'fs';
import * as path from 'path';
import { config } from "../../core/config.js";

// Load environment variables
dotenv.config();

// Default configuration for Solana and Jupiter API endpoints
const defaultConfig = {
    solanaEndpoint: config.solanaEndpoint,
    jupiterEndpoint: config.jupiterEndpoint,
};

export class SolanaSwapService {
    constructor() {
        // Set fallback defaults
        const defaultSolanaEndpoint = defaultConfig.solanaEndpoint;
        const defaultJupiterEndpoint = defaultConfig.jupiterEndpoint;

        this.solanaConnection = new Connection(defaultSolanaEndpoint); // Solana connection
        const { createJupiterApiClient } = JupiterApi;
        this.jupiterApi = createJupiterApiClient({
            basePath: defaultJupiterEndpoint, // Jupiter API client
        });

        this.checkInterval = 10000; // Default check interval
    }

    /**
     * Refresh balances for a given wallet.
     * @param {Keypair} wallet - The wallet to refresh balances for.
     * @returns {Object} - Updated balances including SOL and tokens.
     */
    async refreshBalances(wallet) {
        const balances = { solBalance: 0, tokenBalances: {} };
        try {
            // Fetch SOL balance
            const solBalance = await this.solanaConnection.getBalance(wallet.publicKey);
            balances.solBalance = solBalance;

            // Fetch SPL token balances
            const tokenAccounts = await this.solanaConnection.getTokenAccountsByOwner(wallet.publicKey, {
                programId: TOKEN_PROGRAM_ID,
            });

            for (const tokenAccount of tokenAccounts.value) {
                const accountInfo = await getAccount(this.solanaConnection, tokenAccount.pubkey);
                balances.tokenBalances[accountInfo.mint.toBase58()] = Number(accountInfo.amount);
            }
        } catch (error) {
            console.error('Error refreshing balances:', error);
        }
        return balances;
    }

    /**
     * Get a quote for swapping tokens.
     * @param {QuoteGetRequest} quoteRequest - The quote request details.
     * @returns {QuoteResponse} - The quote response from Jupiter API.
     */
    async getQuote(quoteRequest) {
        try {
            const quote = await this.jupiterApi.quoteGet(quoteRequest);
            if (!quote) throw new Error('No quote found');
            return quote;
        } catch (error) {
            console.error('Error fetching quote:', error);
            throw error;
        }
    }

    /**
     * Execute a swap transaction.
     * @param {Object} params - Parameters for executing the swap.
     * @param {QuoteResponse} params.route - The quote route to execute.
     * @param {Keypair} params.wallet - The wallet to use for the swap.
     * @returns {Object} - The transaction result including TX ID and confirmation details.
     */
    async executeSwap({ route, wallet }) {
        try {
            const {
                computeBudgetInstructions, setupInstructions,
                swapInstruction, cleanupInstruction
            } = await this.jupiterApi.swapInstructionsPost({
                swapRequest: {
                    quoteResponse: route,
                    userPublicKey: wallet.publicKey.toBase58(),
                    prioritizationFeeLamports: 'auto',
                },
            });

            const instructions = [
                ...computeBudgetInstructions.map(this.instructionDataToTransactionInstruction),
                ...setupInstructions.map(this.instructionDataToTransactionInstruction),
                this.instructionDataToTransactionInstruction(swapInstruction),
                this.instructionDataToTransactionInstruction(cleanupInstruction),
            ].filter(Boolean);

            const { blockhash, lastValidBlockHeight } = await this.solanaConnection.getLatestBlockhash();
            const transactionMessage = new TransactionMessage({
                payerKey: wallet.publicKey,
                recentBlockhash: blockhash,
                instructions,
            }).compileToV0Message();

            const transaction = new VersionedTransaction(transactionMessage);
            transaction.sign([wallet]);

            const txId = await this.solanaConnection.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
            const confirmation = await this.solanaConnection.confirmTransaction(
                { signature: txId, blockhash, lastValidBlockHeight }
            );

            if (confirmation.value.err) throw new Error('Transaction failed');

            return { txId, confirmation };
        } catch (error) {
            console.error('Error during swap execution:', error);
            throw error;
        }
    }

    /**
     * Log the swap transaction details to a JSON file.
     * @param {Object} logArgs - Details about the swap to log.
     */
    async logSwap(logArgs) {
        const filePath = path.join(__dirname, 'trades.json');
        const data = { ...logArgs };
        try {
            if (fs.existsSync(filePath)) {
                const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                fileData.push(data);
                fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
            } else {
                fs.writeFileSync(filePath, JSON.stringify([data], null, 2));
            }
        } catch (error) {
            console.error('Error logging swap:', error);
        }
    }

    /**
     * Start monitoring for swaps and execute trades immediately when a valid quote is available.
     * @param {Object} params - Parameters for price watching.
     * @param {Keypair} params.wallet - The wallet to use for monitoring.
     * @param {string} params.inputMint - The mint address of the input token.
     * @param {string} params.outputMint - The mint address of the output token.
     * @param {number} params.amount - The amount of the input token.
     */
    async startJupiterSwap({ wallet, inputMint, outputMint, amount }) {
        setInterval(async () => {
            try {
                // Fetch a valid quote and execute the swap immediately
                const quote = await this.getQuote({ inputMint, outputMint, amount: amount.toString() });
                const swapResult = await this.executeSwap({ route: quote, wallet });
                console.log('✅ Swap completed:', swapResult);

                // Refresh balances and log the swap
                const balances = await this.refreshBalances(wallet);
                console.log('🏦 Updated balances:', balances);

                await this.logSwap({
                    inputToken: inputMint,
                    inAmount: amount,
                    outputToken: outputMint,
                    outAmount: quote.outAmount,
                    txId: swapResult.txId,
                    timestamp: new Date().toISOString(),
                });
            } catch (error) {
                console.error('Error during price watch:', error);
            }
        }, this.checkInterval);
    }

    /**
     * Convert Jupiter instruction data to a Solana transaction instruction.
     * @param {Instruction} instruction - The instruction data.
     * @returns {TransactionInstruction} - The transaction instruction.
     */
    instructionDataToTransactionInstruction(instruction) {
        if (!instruction) return null;
        return new TransactionInstruction({
            programId: new PublicKey(instruction.programId),
            keys: instruction.accounts.map((key) => ({
                pubkey: new PublicKey(key.pubkey),
                isSigner: key.isSigner,
                isWritable: key.isWritable,
            })),
            data: Buffer.from(instruction.data, 'base64'),
        });
    }
}
