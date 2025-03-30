import { type Database } from "sql.js";
export declare function writeData(data: Uint8Array): Promise<void>;
export declare function readData(config?: {
    dbPath?: string;
}): Promise<Database | null>;
export declare function saveData(db: Database, dbPath: string): Promise<void>;
