import { type Database } from "sql.js";
export declare function readData(): Promise<Database | null>;
export declare function saveData(db: Database): Promise<void>;
