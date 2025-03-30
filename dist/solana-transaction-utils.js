"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParsedTransactionStream = void 0;
exports.getInstructionIndex = getInstructionIndex;
exports.getAccountMetas = getAccountMetas;
exports.getTokenTransfers = getTokenTransfers;
const web3_js_1 = require("@solana/web3.js");
const util_1 = require("./util");
const CHUNK_SIZE = 250;
function getInstructionIndex(transaction, instruction) {
    const index = transaction.transaction.message.instructions.indexOf(instruction);
    if (index != -1) {
        return index;
    }
    if (transaction.meta?.innerInstructions) {
        const outerInstruction = transaction.meta.innerInstructions.find((innerInstruction) => innerInstruction.instructions.find((i) => i == instruction));
        if (outerInstruction) {
            return outerInstruction.index;
        }
        return -1;
    }
    return -1;
}
function getAccountMetas(transaction, instruction) {
    const accounts = instruction.accounts;
    return accounts
        .map((account) => {
        const data = transaction.transaction.message.accountKeys.find((key) => key.pubkey.toBase58() == account.toBase58());
        if (data) {
            const { pubkey, signer: isSigner, writable: isWritable } = data;
            return {
                pubkey,
                isSigner,
                isWritable,
            };
        }
        return null;
    })
        .filter((meta) => meta !== null);
}
function getTokenTransfers(transaction, index) {
    if (index == -1) {
        return [];
    }
    const instruction = transaction.meta?.innerInstructions?.find((i) => i.index == index);
    if (instruction == undefined) {
        return [];
    }
    const transfers = instruction.instructions.filter((i) => "program" in i &&
        i.program == "spl-token" &&
        "parsed" in i &&
        i.parsed.type == "transferChecked");
    if (transfers.length == 0) {
        return [];
    }
    return transfers.map((transfer) => {
        const { mint, tokenAmount } = transfer.parsed.info;
        const { uiAmount: amount } = tokenAmount;
        return {
            mint,
            amount,
        };
    });
}
class ParsedTransactionStream {
    get cancelled() {
        return this._cancelled;
    }
    constructor(config) {
        this._cancelled = false;
        this._currentSignatures = [];
        this._account = new web3_js_1.PublicKey(config.account);
        this._connection = new web3_js_1.Connection(config.endpoint, config);
        this._mostRecentSignature = config?.mostRecentSignature;
        this._oldestSignature = config?.oldestSignature;
        this._oldestDate = config?.oldestDate;
        this._endDate = config?.endDate;
        this._chunkSize = config?.chunkSize || CHUNK_SIZE;
        if (!ParsedTransactionStream._apiThrottle) {
            ParsedTransactionStream._apiThrottle = new util_1.ApiThrottle(config?.throttleParameters?.rpc?.max || Infinity, config?.throttleParameters?.rpc?.interval || 0);
        }
        this._onParsedTransactionsReceived = config.onParsedTransactionsReceived;
        this._onSignaturesReceived = config.onSignaturesReceived;
        this._onDone = config.onDone;
    }
    static stream(config) {
        const stream = new ParsedTransactionStream(config);
        stream._stream();
        return stream;
    }
    async _stream() {
        let validSignatures = [];
        let before = this._mostRecentSignature ? undefined : this._oldestSignature;
        do {
            this._currentSignatures =
                await ParsedTransactionStream._apiThrottle.processItem(before, (before) => this._getSignaturesForAddress(before));
            if (this._currentSignatures.length == 0) {
                continue;
            }
            const newValidSignatures = this._filterSignatures();
            if (this._onSignaturesReceived && !this._cancelled) {
                await this._onSignaturesReceived(this._currentSignatures);
            }
            validSignatures = validSignatures.concat(newValidSignatures);
            if (validSignatures.length >= this._chunkSize && !this._cancelled) {
                await this._sendParsedTransactions(validSignatures);
                validSignatures = [];
            }
            before = this._before;
        } while (this._continue);
        if (!this._cancelled) {
            await this._sendParsedTransactions(validSignatures);
        }
        if (this._onDone) {
            this._onDone();
        }
    }
    _getSignaturesForAddress(before) {
        return this._connection.getSignaturesForAddress(this._account, {
            before,
        });
    }
    _filterSignatures() {
        const signatureStrings = this._currentSignatures.map((signature) => signature.signature);
        if (this._hasMostRecentSignature) {
            return this._currentSignatures
                .slice(0, signatureStrings.indexOf(this._mostRecentSignature))
                .filter((signature) => !signature.err);
        }
        // If we have an end date and any signature is after it, we should stop fetching more
        if (this._endDate) {
            const hasFutureSignatures = this._currentSignatures.some((signature) => new Date(signature.blockTime * 1000) > this._endDate);
            if (hasFutureSignatures) {
                this._cancelled = true;
            }
        }
        return this._currentSignatures.filter((signature) => {
            if (signature.err)
                return false;
            const signatureDate = new Date(signature.blockTime * 1000);
            if (this._oldestDate && signatureDate < this._oldestDate)
                return false;
            if (this._endDate && signatureDate > this._endDate)
                return false;
            return true;
        });
    }
    async _sendParsedTransactions(validSignatures) {
        if (this._cancelled) {
            return;
        }
        const chunks = (0, util_1.chunkArray)(validSignatures, Math.ceil(this._chunkSize));
        for (let i = 0; i < chunks.length; i++) {
            const transactions = await ParsedTransactionStream._apiThrottle.processItem(chunks[i].map((signature) => signature.signature), (signatures) => this._getParsedTransactions(signatures));
            if (this._cancelled) {
                return;
            }
            await this._onParsedTransactionsReceived(transactions);
        }
    }
    _getParsedTransactions(validSignatures) {
        return this._connection.getParsedTransactions(validSignatures, {
            maxSupportedTransactionVersion: 0,
        });
    }
    cancel() {
        this._cancelled = true;
    }
    get _continue() {
        if (this._currentSignatures.length == 0 ||
            this._cancelled ||
            this._hasOldestDate ||
            this._hasEndDate) {
            return false;
        }
        if (this._hasMostRecentSignature && !this._oldestSignature) {
            return false;
        }
        return true;
    }
    get _hasMostRecentSignature() {
        return (Boolean(this._mostRecentSignature) &&
            this._currentSignatures.some((signature) => signature.signature == this._mostRecentSignature));
    }
    get _hasOldestDate() {
        return (Boolean(this._oldestDate) &&
            this._currentSignatures.some((signature) => new Date(signature.blockTime * 1000) < this._oldestDate));
    }
    get _hasEndDate() {
        if (!this._endDate)
            return false;
        // Check if any signature in the current batch is after the end date
        const hasFutureSignatures = this._currentSignatures.some((signature) => new Date(signature.blockTime * 1000) > this._endDate);
        // If we have future signatures, we should stop fetching more
        if (hasFutureSignatures) {
            this._cancelled = true;
        }
        return hasFutureSignatures;
    }
    get _before() {
        if (this._hasMostRecentSignature) {
            return this._oldestSignature;
        }
        if (this._currentSignatures.length > 0) {
            return this._currentSignatures[this._currentSignatures.length - 1]
                .signature;
        }
        return undefined;
    }
}
exports.ParsedTransactionStream = ParsedTransactionStream;
//# sourceMappingURL=solana-transaction-utils.js.map