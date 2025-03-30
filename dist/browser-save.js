"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readData = readData;
exports.saveData = saveData;
const sql_js_1 = __importDefault(require("sql.js"));
const STORAGE_KEY = "meteora-dlmm-db";
async function readData() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
        return null;
    }
    const SQL = await (0, sql_js_1.default)();
    return new SQL.Database(JSON.parse(data));
}
async function saveData(db) {
    const data = db.export();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
//# sourceMappingURL=browser-save.js.map