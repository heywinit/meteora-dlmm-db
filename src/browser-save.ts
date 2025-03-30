import { type Database } from "sql.js";
import initSqlJs from "sql.js";

const STORAGE_KEY = "meteora-dlmm-db";

export async function readData(): Promise<Database | null> {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    return null;
  }
  const SQL = await initSqlJs();
  return new SQL.Database(JSON.parse(data));
}

export async function saveData(db: Database): Promise<void> {
  const data = db.export();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
