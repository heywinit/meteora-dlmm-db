"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const jupiter_token_list_api_1 = require("./jupiter-token-list-api");
const meteora_dlmm_api_1 = require("./meteora-dlmm-api");
const meteora_instruction_parser_1 = require("./meteora-instruction-parser");
const solana_transaction_utils_1 = require("./solana-transaction-utils");
class MeteoraDownloader {
    get downloadComplete() {
        return this.positionsComplete && !this._fetchingUsd;
    }
    get positionsComplete() {
        return (this._isDone &&
            !this._fetchingMissingPairs &&
            !this._fetchingMissingTokens);
    }
    constructor(db, config) {
        this._gotNewest = false;
        this._fetchingMissingPairs = false;
        this._fetchingMissingTokens = false;
        this._fetchingUsd = false;
        this._isDone = false;
        this._finished = false;
        this._accountSignatureCount = 0;
        this._positionTransactionIds = new Set();
        this._positionAddresses = new Set();
        this._usdPositionAddresses = new Set();
        this._isComplete = false;
        this._transactionDownloadCancelled = false;
        this._fullyCancelled = false;
        this._oldestSignature = "";
        this._oldestBlocktime = 0;
        this._config = config;
        this._connection = new web3_js_1.Connection(config.endpoint, config);
        this._db = db;
        this._onDone = config.callbacks?.onDone;
        this._onSignaturesReceived = config.callbacks?.onSignaturesReceived;
        this._onInstructionsLoaded = config.callbacks?.onInstructionsLoaded;
        this._onMissingPairsFetched = config.callbacks?.onMissingPairsFetched;
        this._onMissingTokensFetched = config.callbacks?.onMissingTokensFetched;
        this._onUsdTransactionsFetched = config.callbacks?.onUsdTransactionsFetched;
        this._onCancelled = config.callbacks?.onCancelled;
        this._onProgress = config.callbacks?.onProgress;
        this._startTime = Date.now();
        this._init(config);
    }
    async _init(config) {
        if (config.account.length >= 43 && config.account.length <= 44) {
            this._account = config.account;
        }
        else {
            this._connection = new web3_js_1.Connection(config.endpoint, config);
            const signatureMatch = config.account.match(/\w+$/);
            if (!signatureMatch || signatureMatch?.length == 0) {
                throw new Error(`${config.account} is not a valid account or transaction signature`);
            }
            const signature = signatureMatch[0];
            const parsedTransaction = await this._connection.getParsedTransaction(signature);
            const instructions = (0, meteora_instruction_parser_1.parseMeteoraInstructions)(parsedTransaction);
            if (instructions.length == 0) {
                throw new Error(`${config.account} is not a Meteora DLMM transaction`);
            }
            this._account = instructions[0].accounts.position;
        }
        if (config.throttleParameters) {
            if (config.throttleParameters.meteoraDlmm) {
                meteora_dlmm_api_1.MeteoraDlmmApi.updateThrottleParameters(config.throttleParameters.meteoraDlmm);
            }
            if (config.throttleParameters.jupiterTokenList) {
                jupiter_token_list_api_1.JupiterTokenListApi.updateThrottleParameters(config.throttleParameters.jupiterTokenList);
            }
        }
        this._isComplete = await this._db.isComplete(this._account);
        this._stream = solana_transaction_utils_1.ParsedTransactionStream.stream({
            ...config,
            oldestDate: config.startDate || new Date("11/06/2023"),
            endDate: config.endDate || new Date(),
            mostRecentSignature: await this._db.getMostRecentSignature(this._account),
            oldestSignature: !this._isComplete
                ? await this._db.getOldestSignature(this._account)
                : undefined,
            onSignaturesReceived: (signatures) => this._onNewSignaturesReceived(signatures),
            onParsedTransactionsReceived: (transactions) => this._loadInstructions(transactions),
            onDone: () => {
                this._isDone = true;
                this._fetchMissingPairs();
            },
        });
    }
    async stats() {
        return {
            downloadingComplete: this.downloadComplete,
            positionsComplete: this.positionsComplete,
            transactionDownloadCancelled: this._transactionDownloadCancelled,
            fullyCancelled: this._fullyCancelled,
            secondsElapsed: (Date.now() - this._startTime) / 1000,
            accountSignatureCount: this._accountSignatureCount,
            positionCount: this._positionAddresses.size,
            positionTransactionCount: this._positionTransactionIds.size,
            usdPositionCount: this._usdPositionAddresses.size,
            missingUsd: (await this._db.getMissingUsd()).length,
            oldestTransactionDate: this._oldestTransactionDate,
        };
    }
    async _notifyProgress() {
        if (this._onProgress) {
            const stats = await this.stats();
            this._onProgress(stats);
        }
    }
    async _loadInstructions(transactions) {
        if (this._transactionDownloadCancelled) {
            return this._fetchUsd();
        }
        let instructionCount = 0;
        const start = Date.now();
        transactions.forEach((transaction) => {
            (0, meteora_instruction_parser_1.parseMeteoraInstructions)(transaction).forEach(async (instruction) => {
                if (this._transactionDownloadCancelled) {
                    return this._fetchUsd();
                }
                instructionCount++;
                await this._db.addInstruction(instruction);
                this._positionAddresses.add(instruction.accounts.position);
                this._positionTransactionIds.add(instruction.signature);
            });
        });
        const elapsed = Date.now() - start;
        console.log(`Downloaded ${instructionCount} instructions in ${elapsed}ms`);
        if (this._onInstructionsLoaded) {
            this._onInstructionsLoaded(instructionCount, elapsed);
        }
        await this._notifyProgress();
        this._fetchMissingPairs();
    }
    async _onNewSignaturesReceived(signatures) {
        if (this._oldestBlocktime > 0) {
            await this._db.setOldestSignature(this._account, this._oldestBlocktime, this._oldestSignature);
        }
        this._accountSignatureCount += signatures.length;
        const newest = !this._gotNewest ? signatures[0].signature : undefined;
        this._gotNewest = true;
        this._oldestBlocktime = signatures[signatures.length - 1].blockTime;
        this._oldestSignature = signatures[signatures.length - 1].signature;
        this._oldestTransactionDate = new Date(this._oldestBlocktime * 1000);
        const oldestDate = this._oldestTransactionDate.toDateString();
        const elapsed = Math.round((Date.now() - this._startTime) / 1000);
        console.log(`${elapsed}s - ${newest ? `Newest transaction: ${newest}, ` : ""}Oldest transaction (${oldestDate}): ${this._oldestSignature}`);
        if (this._onSignaturesReceived) {
            this._onSignaturesReceived(signatures);
        }
        await this._notifyProgress();
    }
    async _fetchMissingPairs() {
        if (this._fetchingMissingPairs || this._transactionDownloadCancelled) {
            return this._fetchUsd();
        }
        let missingPairs = await this._db.getMissingPairs();
        if (missingPairs.length > 0) {
            this._fetchingMissingPairs = true;
            while (missingPairs.length > 0) {
                const address = missingPairs.shift();
                if (address) {
                    const missingPair = await meteora_dlmm_api_1.MeteoraDlmmApi.getDlmmPairData(address);
                    if (this._transactionDownloadCancelled) {
                        return this._fetchUsd();
                    }
                    await this._db.addPair(missingPair);
                    console.log(`Added missing pair for ${missingPair.name}`);
                    if (this._onMissingPairsFetched) {
                        this._onMissingPairsFetched(address, missingPair);
                    }
                    await this._notifyProgress();
                    if (this._transactionDownloadCancelled) {
                        return this._fetchUsd();
                    }
                    missingPairs = await this._db.getMissingPairs();
                }
            }
            this._fetchingMissingPairs = false;
        }
        this._fetchMissingTokens();
    }
    async _fetchMissingTokens() {
        if (this._fetchingMissingTokens || this._transactionDownloadCancelled) {
            return this._fetchUsd();
        }
        let missingTokens = await this._db.getMissingTokens();
        if (missingTokens.length > 0) {
            this._fetchingMissingTokens = true;
            while (missingTokens.length > 0) {
                const address = missingTokens.shift();
                if (address) {
                    let missingToken = await jupiter_token_list_api_1.JupiterTokenListApi.getToken(address);
                    if (missingToken == null) {
                        missingToken = await this._getMissingToken(address);
                    }
                    if (this._transactionDownloadCancelled) {
                        return this._fetchUsd();
                    }
                    await this._db.addToken(missingToken);
                    console.log(`Added missing token ${missingToken.symbol}`);
                    if (this._onMissingTokensFetched) {
                        this._onMissingTokensFetched(address, missingToken);
                    }
                    await this._notifyProgress();
                }
                if (this._transactionDownloadCancelled) {
                    return this._fetchUsd();
                }
                missingTokens = await this._db.getMissingTokens();
            }
            this._fetchingMissingTokens = false;
        }
        this._fetchUsd();
    }
    async _getMissingToken(address) {
        if (!this._connection) {
            this._connection = new web3_js_1.Connection(this._config.endpoint, this._config);
        }
        const tokenData = await this._connection.getParsedAccountInfo(new web3_js_1.PublicKey(address));
        if (tokenData.value &&
            tokenData.value.data &&
            "parsed" in tokenData.value.data) {
            return {
                address,
                name: tokenData.value.data.parsed.info.name || null,
                symbol: tokenData.value.data.parsed.info.symbol || null,
                decimals: tokenData.value.data.parsed.info.decimals,
                logoURI: tokenData.value.data.parsed.info.logoURI || null,
            };
        }
        throw new Error(`Token mint ${address} was not found`);
    }
    async _fetchUsd() {
        if (this._fetchingUsd || this._fullyCancelled) {
            return;
        }
        let missingUsd = await this._db.getMissingUsd();
        if (missingUsd.length > 0) {
            this._fetchingUsd = true;
            while (missingUsd.length > 0) {
                const address = missingUsd.shift();
                if (address) {
                    this._usdPositionAddresses.add(address);
                    const usd = await meteora_dlmm_api_1.MeteoraDlmmApi.getTransactions(address);
                    if (this._fullyCancelled) {
                        return;
                    }
                    await this._db.addUsdTransactions(address, usd);
                    const elapsed = Math.round((Date.now() - this._startTime) / 1000);
                    console.log(`${elapsed}s - Added USD transactions for position ${address}`);
                    if (this._onUsdTransactionsFetched) {
                        this._onUsdTransactionsFetched(address, usd.deposits.length + usd.withdrawals.length + usd.fees.length);
                    }
                    await this._notifyProgress();
                }
                if (this._fullyCancelled) {
                    return;
                }
                missingUsd = await this._db.getMissingUsd();
                if (missingUsd.length > 0) {
                    console.log(`${missingUsd.length} positions remaining to load USD`);
                }
            }
            this._fetchingUsd = false;
        }
        this._finish();
    }
    async _finish() {
        if (this.downloadComplete && !this._fullyCancelled && !this._finished) {
            this._finished = true;
            if (!this._transactionDownloadCancelled) {
                await this._db.markComplete(this._account);
            }
            await this._db.save();
            if (this._onDone) {
                this._onDone();
            }
        }
    }
    cancel() {
        if (this._transactionDownloadCancelled) {
            this._fullyCancelled = true;
            if (this._onCancelled) {
                this._onCancelled(true);
            }
        }
        else {
            this._transactionDownloadCancelled = true;
            this._stream.cancel();
            if (this._onCancelled) {
                this._onCancelled(false);
            }
        }
    }
}
exports.default = MeteoraDownloader;
//# sourceMappingURL=meteora-dlmm-downloader.js.map