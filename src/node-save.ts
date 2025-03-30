import { type Database } from "sql.js";
import initSqlJs from "sql.js";
import { promises as fs } from "fs";
import path from "path";
import MeteoraDlmmDb from "./meteora-dlmm-db";

let fsPromises: any;
async function init() {
  if (!fsPromises) {
    fsPromises = await import("fs/promises");
  }
}

// Write function
export async function writeData(data: Uint8Array): Promise<void> {
  await init();

  fsPromises.writeFileSync("./meteora-dlmm.db", data);
}

// Read function
export async function readData(
  config: { dbPath?: string } = {}
): Promise<Database | null> {
  const dbPath = config.dbPath ?? "meteora-dlmm.db";
  try {
    const data = await fs.readFile(dbPath);
    const SQL = await initSqlJs();
    return new SQL.Database(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function saveData(db: Database, dbPath: string): Promise<void> {
  const data = db.export();
  await fs.writeFile(dbPath, Buffer.from(data));
}
