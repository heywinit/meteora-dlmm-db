import { IDL, LBCLMM_PROGRAM_IDS } from "@meteora-ag/dlmm";
import {
  type Idl,
  type Instruction,
  BorshEventCoder,
  BorshInstructionCoder,
} from "@project-serum/anchor";
import { base64, bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import type {
  AccountMeta,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
} from "@solana/web3.js";
import {
  getInstructionIndex,
  getAccountMetas,
  getTokenTransfers,
  type TokenTransferInfo,
} from "./solana-transaction-utils";
import {
  getHawksightAccount,
  getHawksightTokenTransfers,
} from "./hawksight-parser";

export type MeteoraDlmmInstructionType =
  | "open"
  | "add"
  | "remove"
  | "claim"
  | "close";

export type MeteoraDlmmInstructionName =
  | "initializePosition"
  | "addLiquidity"
  | "addLiquidityByWeight"
  | "addLiquidityByStrategy"
  | "addLiquidityByStrategyOneSide"
  | "addLiquidityOneSide"
  | "removeLiquidity"
  | "removeAllLiquidity"
  | "removeLiquiditySingleSide"
  | "removeLiquidityByRange"
  | "RemoveLiquidity"
  | "claimFee"
  | "closePosition";

const INSTRUCTION_MAP: Map<
  MeteoraDlmmInstructionName,
  MeteoraDlmmInstructionType
> = new Map([
  ["initializePosition", "open"],
  ["addLiquidity", "add"],
  ["addLiquidityByWeight", "add"],
  ["addLiquidityByStrategy", "add"],
  ["addLiquidityByStrategyOneSide", "add"],
  ["addLiquidityOneSide", "add"],
  ["removeLiquidity", "remove"],
  ["removeAllLiquidity", "remove"],
  ["removeLiquiditySingleSide", "remove"],
  ["removeLiquidityByRange", "remove"],
  ["RemoveLiquidity", "remove"],
  ["claimFee", "claim"],
  ["closePosition", "close"],
]);

interface MeteoraDlmmDecodedInstruction extends Instruction {
  name: MeteoraDlmmInstructionName;
  data: any;
}

interface MeteoraDlmmAccounts {
  position: string;
  lbPair: string;
  sender: string;
}

export interface MeteoraDlmmInstruction {
  isHawksight: boolean;
  signature: string;
  slot: number;
  blockTime: number;
  instructionName: string;
  instructionType: MeteoraDlmmInstructionType;
  accounts: MeteoraDlmmAccounts;
  tokenTransfers: TokenTransferInfo[];
  activeBinId: number | null;
  removalBps: number | null;
}

const INSTRUCTION_CODER: BorshInstructionCoder = new BorshInstructionCoder(
  IDL as Idl,
);
let EVENT_CODER: BorshEventCoder = new BorshEventCoder(IDL as Idl);

export function sortMeteoraInstructions(
  instructions: MeteoraDlmmInstruction[],
): MeteoraDlmmInstruction[] {
  return instructions.sort((a, b) => {
    return a.blockTime != b.blockTime
      ? // If they're different block times, take them in ascending order
        a.blockTime - b.blockTime
      : // Take the first instruction when it is open
      a.instructionType == "open"
      ? -1
      : // Take the second instruction when it is open
      b.instructionType == "open"
      ? 1
      : // Take the first instruction when it is claim
      a.instructionType == "claim"
      ? -1
      : // Take the second instruction when it is claim
      b.instructionType == "claim"
      ? 1
      : // Take the second instruction when the first is close
      a.instructionType == "close"
      ? 1
      : // Take the first instruction when the second is close
      b.instructionType == "close"
      ? -1
      : // Everthing else just take it as it comes
        0;
  });
}

export function parseMeteoraInstructions(
  transaction: ParsedTransactionWithMeta | null,
): MeteoraDlmmInstruction[] {
  if (transaction == null) {
    return [];
  }
  const hawksightAccount = getHawksightAccount(transaction);
  const parsedInstructions = transaction.transaction.message.instructions.map(
    (instruction) =>
      parseMeteoraInstruction(transaction, instruction, hawksightAccount),
  );
  if (transaction.meta?.innerInstructions) {
    const innerInstructions = transaction.meta.innerInstructions
      .map((instruction) => instruction.instructions)
      .flat()
      .map((instruction) =>
        parseMeteoraInstruction(transaction, instruction, hawksightAccount),
      );
    return parsedInstructions
      .concat(innerInstructions)
      .filter((instruction) => instruction !== null);
  }
  return parsedInstructions.filter((instruction) => instruction !== null);
}

function parseMeteoraInstruction(
  transaction: ParsedTransactionWithMeta,
  instruction: PartiallyDecodedInstruction | ParsedInstruction,
  hawksightAccount: string | null,
) {
  if (instruction.programId.toBase58() == LBCLMM_PROGRAM_IDS["mainnet-beta"]) {
    try {
      if ("data" in instruction) {
        return getMeteoraInstructionData(
          transaction,
          instruction,
          hawksightAccount,
        );
      }
    } catch (err) {
      console.error(err);
      throw new Error(
        `Failed to parse Meteora DLMM instruction on signature ${transaction.transaction.signatures[0]}`,
      );
    }
  }
  return null;
}

function getMeteoraInstructionData(
  transaction: ParsedTransactionWithMeta,
  instruction: PartiallyDecodedInstruction,
  hawksightAccount: string | null,
): MeteoraDlmmInstruction | null {
  const decodedInstruction = INSTRUCTION_CODER.decode(
    instruction.data,
    "base58",
  ) as MeteoraDlmmDecodedInstruction;
  if (!transaction.blockTime) {
    throw new Error(
      `Transaction blockTime missing from signature ${transaction.transaction.signatures[0]}`,
    );
  }
  if (!decodedInstruction || !INSTRUCTION_MAP.has(decodedInstruction.name)) {
    // Unknown instruction
    return null;
  }
  const index = getInstructionIndex(transaction, instruction);
  if (index == -1) {
    return null;
  }
  const instructionName = decodedInstruction.name;
  const instructionType = INSTRUCTION_MAP.get(decodedInstruction.name)!;
  const accountMetas = getAccountMetas(transaction, instruction);
  const accounts = getPositionAccounts(
    decodedInstruction,
    accountMetas,
    hawksightAccount,
  );
  const tokenTransfers = !hawksightAccount
    ? getTokenTransfers(transaction, index)
    : getHawksightTokenTransfers(transaction, instruction, index);
  const activeBinId =
    tokenTransfers.length > 0 ? getActiveBinId(transaction, index) : null;
  const removalBps =
    instructionType == "remove" ? getRemovalBps(decodedInstruction) : null;
  return {
    isHawksight: Boolean(hawksightAccount),
    signature: transaction.transaction.signatures[0],
    slot: transaction.slot,
    blockTime: transaction.blockTime,
    instructionName,
    instructionType,
    accounts,
    tokenTransfers,
    activeBinId,
    removalBps,
  };
}

function getPositionAccounts(
  decodedInstruction: MeteoraDlmmDecodedInstruction,
  accountMetas: AccountMeta[],
  hawksightAccount: string | null,
): MeteoraDlmmAccounts {
  try {
    const { accounts } = INSTRUCTION_CODER.format(
      decodedInstruction,
      accountMetas,
    )!;
    const positionAccount = accounts.find(
      (account) => account.name == "Position",
    )!;
    const position = positionAccount.pubkey.toBase58();
    const lbPairAccount = accounts.find(
      (account) => account.name == "Lb Pair",
    )!;
    const lbPair = lbPairAccount.pubkey.toBase58();
    const senderAccount = accounts.find(
      (account) => account.name == "Sender" || account.name == "Owner",
    )!;
    const sender = hawksightAccount || senderAccount.pubkey.toBase58();

    return {
      position,
      lbPair,
      sender,
    };
  } catch (err) {
    switch (decodedInstruction.name) {
      case "initializePosition":
        return {
          position: accountMetas[1].pubkey.toBase58(),
          lbPair: accountMetas[2].pubkey.toBase58(),
          sender: hawksightAccount || accountMetas[3].pubkey.toBase58(),
        };

      case "addLiquidityOneSide":
        return {
          position: accountMetas[0].pubkey.toBase58(),
          lbPair: accountMetas[1].pubkey.toBase58(),
          sender: hawksightAccount || accountMetas[8].pubkey.toBase58(),
        };

      case "addLiquidityByWeight":
        return {
          position: accountMetas[0].pubkey.toBase58(),
          lbPair: accountMetas[1].pubkey.toBase58(),
          sender: hawksightAccount || accountMetas[11].pubkey.toBase58(),
        };
    }

    return {
      position: accountMetas[0].pubkey.toBase58(),
      lbPair: accountMetas[1].pubkey.toBase58(),
      sender: hawksightAccount || accountMetas[11].pubkey.toBase58(),
    };
  }
}

function getActiveBinId(
  transaction: ParsedTransactionWithMeta,
  index: number,
): number | null {
  if (transaction.meta && transaction.meta.innerInstructions) {
    const parsedInnerInstruction = transaction.meta.innerInstructions.find(
      (i) => i.index == index,
    );
    if (parsedInnerInstruction && parsedInnerInstruction.instructions) {
      const instructions = parsedInnerInstruction.instructions;
      const meteoraInstructions = instructions.filter(
        (instruction) =>
          instruction.programId.toBase58() ==
          LBCLMM_PROGRAM_IDS["mainnet-beta"],
      ) as PartiallyDecodedInstruction[];

      const events = meteoraInstructions.map((instruction) => {
        const ixData = bs58.decode(instruction.data);
        // @ts-ignore
        const eventData = base64.encode(ixData.subarray(8));

        return EVENT_CODER.decode(eventData);
      });

      const eventWithActiveBinId = events.find(
        (event) => event && "activeBinId" in event.data,
      );

      return eventWithActiveBinId
        ? (eventWithActiveBinId.data.activeBinId as number)
        : null;
    }
  }
  return null;
}

function getRemovalBps(
  decodedInstruction: MeteoraDlmmDecodedInstruction,
): number | null {
  if ("bpsToRemove" in decodedInstruction.data) {
    return Number(decodedInstruction.data.bpsToRemove);
  }
  if ("binLiquidityRemoval" in decodedInstruction.data) {
    return Number(decodedInstruction.data.binLiquidityRemoval[0].bpsToRemove);
  }
  if (decodedInstruction.name.match(/remove/i)) {
    return 10000;
  }
  return null;
}
