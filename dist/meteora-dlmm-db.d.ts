import { type MeteoraDlmmInstruction } from "./meteora-instruction-parser";
import { type MeteoraDlmmPairData, type MeteoraPositionTransactions } from "./meteora-dlmm-api";
import { type TokenMeta } from "./jupiter-token-list-api";
import MeteoraDlmmDownloader, { MeteoraDownloaderConfig } from "./meteora-dlmm-downloader";
interface MeteoraDlmmDbSchema {
    [column: string]: number | boolean | string | Array<unknown> | Uint8Array | null;
}
export interface MeteoraDlmmDbTransactions extends MeteoraDlmmDbSchema {
    block_time: number;
    is_hawksight: boolean;
    signature: string;
    position_address: string;
    owner_address: string;
    pair_address: string;
    base_mint: string;
    base_symbol: string;
    base_decimals: number;
    base_logo: string;
    quote_mint: string;
    quote_symbol: string;
    quote_decimals: number;
    quote_logo: string;
    is_inverted: number;
    position_is_open: number;
    is_opening_transaction: number;
    is_closing_transaction: number;
    price: number;
    fee_amount: number;
    deposit: number;
    withdrawal: number;
    usd_fee_amount: number;
    usd_deposit: number;
    usd_withdrawal: number;
}
export interface MeteoraDlmmDbConfig {
    /** Path to the database file (Node.js only) */
    dbPath?: string;
    /** SQL.js configuration options */
    sqlJsConfig?: {
        locateFile?: (file: string) => string;
        wasmBinary?: ArrayBuffer;
        wasmBinaryFile?: string;
    };
    /** Whether to delay saving operations */
    delaySave?: boolean;
    /** Maximum number of operations in the queue before processing */
    maxQueueSize?: number;
}
export declare class MeteoraDlmmError extends Error {
    readonly cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
export declare class MeteoraDlmmDbError extends MeteoraDlmmError {
    constructor(message: string, cause?: unknown);
}
export default class MeteoraDlmmDb {
    private _db;
    private _addInstructionStatement;
    private _addTransferStatement;
    private _addPairStatement;
    private _addTokenStatement;
    private _addUsdYStatement;
    private _addUsdXStatement;
    private _fillMissingUsdStatement;
    private _setOldestSignature;
    private _markCompleteStatement;
    private _getAllTransactions;
    private _updatePositionStatement;
    private _downloaders;
    private _saving;
    private _queue;
    private readonly _config;
    delaySave: boolean;
    private constructor();
    /**
     * Creates a new Meteora DLMM database instance
     * @param data Optional database data to initialize with
     * @param config Optional configuration options
     * @returns A new MeteoraDlmmDb instance
     * @throws {MeteoraDlmmDbError} If database initialization fails
     */
    static create(data?: ArrayLike<number> | Buffer | null, config?: MeteoraDlmmDbConfig): Promise<MeteoraDlmmDb>;
    /**
     * Loads an existing Meteora DLMM database
     * @param config Optional configuration options
     * @returns A new MeteoraDlmmDb instance
     * @throws {MeteoraDlmmDbError} If database loading fails
     */
    static load(config?: MeteoraDlmmDbConfig): Promise<MeteoraDlmmDb>;
    private _init;
    private _createTables;
    private _createStatements;
    private _addInitialData;
    download(config: MeteoraDownloaderConfig): MeteoraDlmmDownloader;
    addInstruction(instruction: MeteoraDlmmInstruction): Promise<void>;
    addTransfers(instruction: MeteoraDlmmInstruction): Promise<void>;
    addPair(pair: MeteoraDlmmPairData): Promise<void>;
    addToken(token: TokenMeta): Promise<void>;
    addUsdTransactions(position_address: string, transactions: MeteoraPositionTransactions): Promise<void>;
    setOldestSignature($account_address: string, $oldest_block_time: number, $oldest_signature: string): Promise<void>;
    markComplete($account_address: string): Promise<void>;
    isComplete(account_address: string): Promise<boolean>;
    getMissingPairs(): Promise<string[]>;
    getMissingTokens(): Promise<string[]>;
    getMissingUsd(): Promise<string[]>;
    getMostRecentSignature(owner_address: string): Promise<string | undefined>;
    getOldestSignature(owner_address: string): Promise<string | undefined>;
    getAllTransactions(): Promise<MeteoraDlmmDbTransactions[]>;
    getOwnerTransactions(owner_address: string): Promise<MeteoraDlmmDbTransactions[]>;
    cancelDownload(account: string): Promise<void>;
    private _getAll;
    private _queueDbCall;
    private _processQueue;
    /**
     * Saves the current database state
     * @throws {MeteoraDlmmDbError} If saving fails
     */
    save(): Promise<void>;
    private _waitUntilReady;
    waitForSave(): Promise<void>;
}
export {};
