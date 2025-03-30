"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeData = writeData;
exports.readData = readData;
exports.saveData = saveData;
const sql_js_1 = __importDefault(require("sql.js"));
const fs_1 = require("fs");
// Write function
async function writeData(data) {
    await fs_1.promises.writeFile("./meteora-dlmm.db", data);
}
// Read function
async function readData(config = {}) {
    const dbPath = config.dbPath ?? "meteora-dlmm.db";
    try {
        const data = await fs_1.promises.readFile(dbPath);
        const SQL = await (0, sql_js_1.default)();
        return new SQL.Database(data);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}
async function saveData(db, dbPath) {
    const data = db.export();
    await fs_1.promises.writeFile(dbPath, Buffer.from(data));
}
//# sourceMappingURL=node-save.js.map