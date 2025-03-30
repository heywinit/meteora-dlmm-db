"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeteoraDlmmApi = exports.DLMM_MAP = void 0;
exports.getAllDlmmPairDetails = getAllDlmmPairDetails;
const meteora_dlmm_cache_1 = __importDefault(require("./meteora-dlmm-cache"));
const util_1 = require("./util");
const METEORA_API = "https://dlmm-api.meteora.ag";
const DLMM_CACHE = meteora_dlmm_cache_1.default;
exports.DLMM_MAP = new Map(DLMM_CACHE.pairs.map((array) => {
    const [lbPair, name, xSymbol, ySymbol, mintX, mintY, binStep, baseFeeBps] = array;
    return [
        lbPair,
        { lbPair, name, xSymbol, ySymbol, mintX, mintY, binStep, baseFeeBps },
    ];
}));
const MAX_CONCURRENT_REQUESTS = 20;
const DELAY_MS = 3000;
async function extractPairData(pair) {
    const { address: lbPair, name, mint_x: mintX, mint_y: mintY, bin_step: binStep, base_fee_percentage, } = pair;
    const [xSymbol, ySymbol] = name.split("-");
    const baseFeeBps = Number(base_fee_percentage) * 100;
    return {
        lbPair,
        name,
        xSymbol,
        ySymbol,
        mintX,
        mintY,
        binStep,
        baseFeeBps,
    };
}
async function getAllDlmmPairDetails() {
    const pairResponse = await fetch(METEORA_API + "/pair/all");
    const pairArray = JSON.parse(await pairResponse.text());
    const pairs = await Promise.all(pairArray.map((pair) => extractPairData(pair)));
    return pairs;
}
class MeteoraDlmmApi {
    static updateThrottleParameters(params) {
        MeteoraDlmmApi._meteoraApi.max = params.max;
        MeteoraDlmmApi._meteoraApi.interval = params.interval;
    }
    static getDlmmPairData(lbPair) {
        return MeteoraDlmmApi._meteoraApi.processItem(lbPair, MeteoraDlmmApi._getDlmmPairData);
    }
    static async _getDlmmPairData(lbPair) {
        try {
            const pairResponse = await fetch(METEORA_API + `/pair/${lbPair}`);
            const pair = JSON.parse(await pairResponse.text());
            const pairData = await extractPairData(pair);
            return pairData;
        }
        catch (err) {
            console.error(err);
            throw new Error(`Meteora DLMM pair with address ${lbPair} was not found`);
        }
    }
    static async getTransactions(positionAddress) {
        const [deposits, withdrawals, fees] = await Promise.all([
            this._fetchDeposits(positionAddress),
            this._fetchWithdraws(positionAddress),
            this._fetchFees(positionAddress),
        ]);
        return { deposits, withdrawals, fees };
    }
    static _fetchDeposits(positionAddress) {
        return MeteoraDlmmApi._fetchApiData(positionAddress, "/deposits");
    }
    static _fetchWithdraws(positionAddress) {
        return MeteoraDlmmApi._fetchApiData(positionAddress, "/withdraws");
    }
    static _fetchFees(positionAddress) {
        return MeteoraDlmmApi._fetchApiData(positionAddress, "/claim_fees");
    }
    static async _fetchApiData(positionAddress, endpoint) {
        return MeteoraDlmmApi._meteoraApi.processItem({
            positionAddress,
            endpoint,
        }, async () => {
            const url = `${METEORA_API}/position/${positionAddress}${endpoint}`;
            const response = await fetch(url);
            const json = await response.json();
            return json;
        });
    }
}
exports.MeteoraDlmmApi = MeteoraDlmmApi;
MeteoraDlmmApi._meteoraApi = new util_1.ApiThrottleCache(MAX_CONCURRENT_REQUESTS, DELAY_MS, exports.DLMM_MAP, MeteoraDlmmApi._getDlmmPairData);
//# sourceMappingURL=meteora-dlmm-api.js.map