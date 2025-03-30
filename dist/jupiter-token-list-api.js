"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.JupiterTokenListApi = exports.TOKEN_MAP = void 0;
exports.getFullJupiterTokenList = getFullJupiterTokenList;
const jupiter_token_list_cache_1 = __importDefault(require("./jupiter-token-list-cache"));
const util_1 = require("./util");
const JUPITER_TOKEN_LIST_API = "https://tokens.jup.ag";
const MAX_CONCURRENT_REQUESTS = 10;
const DELAY_MS = 30 * 1000;
const JUPITER_TOKEN_LIST_CACHE = jupiter_token_list_cache_1.default;
exports.TOKEN_MAP = new Map(JUPITER_TOKEN_LIST_CACHE.tokens.map((array) => {
    const [address, name, symbol, decimals, logoURI] = array;
    return [array[0], { address, name, symbol, decimals, logoURI }];
}));
async function getFullJupiterTokenList() {
    const response = await fetch(JUPITER_TOKEN_LIST_API + "/tokens_with_markets");
    const responseText = await response.text();
    const data = JSON.parse(responseText);
    return data.map((token) => {
        const { address, name, symbol, decimals, logoURI } = token;
        return { address, name, symbol, decimals, logoURI };
    });
}
class JupiterTokenListApi {
    static updateThrottleParameters(params) {
        _a._api.max = params.max;
        _a._api.interval = params.interval;
    }
    static getToken(address) {
        return _a._api.processItem(address, this._getToken);
    }
    static async _getToken(address) {
        const response = await fetch(JUPITER_TOKEN_LIST_API + `/token/${address}`);
        if (response.status == 429) {
            throw new Error(`Too many requests made to Jupiter API`);
        }
        const token = JSON.parse(await response.text());
        if (token == null || !token.address) {
            return null;
        }
        const { name, symbol, decimals, logoURI } = token;
        return { address: token.address, name, symbol, decimals, logoURI };
    }
}
exports.JupiterTokenListApi = JupiterTokenListApi;
_a = JupiterTokenListApi;
JupiterTokenListApi._api = new util_1.ApiThrottleCache(MAX_CONCURRENT_REQUESTS, DELAY_MS, exports.TOKEN_MAP, _a._getToken);
//# sourceMappingURL=jupiter-token-list-api.js.map