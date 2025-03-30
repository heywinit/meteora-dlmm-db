"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sortMeteoraInstructions = sortMeteoraInstructions;
exports.parseMeteoraInstructions = parseMeteoraInstructions;
const dlmm_1 = require("@meteora-ag/dlmm");
const anchor_1 = require("@project-serum/anchor");
const bytes_1 = require("@project-serum/anchor/dist/cjs/utils/bytes");
const solana_transaction_utils_1 = require("./solana-transaction-utils");
const hawksight_parser_1 = require("./hawksight-parser");
const INSTRUCTION_MAP = new Map([
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
const INSTRUCTION_CODER = new anchor_1.BorshInstructionCoder(dlmm_1.IDL);
let EVENT_CODER = new anchor_1.BorshEventCoder(dlmm_1.IDL);
function sortMeteoraInstructions(instructions) {
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
function parseMeteoraInstructions(transaction) {
    if (transaction == null) {
        return [];
    }
    const hawksightAccount = (0, hawksight_parser_1.getHawksightAccount)(transaction);
    const parsedInstructions = transaction.transaction.message.instructions.map((instruction) => parseMeteoraInstruction(transaction, instruction, hawksightAccount));
    if (transaction.meta?.innerInstructions) {
        const innerInstructions = transaction.meta.innerInstructions
            .map((instruction) => instruction.instructions)
            .flat()
            .map((instruction) => parseMeteoraInstruction(transaction, instruction, hawksightAccount));
        return parsedInstructions
            .concat(innerInstructions)
            .filter((instruction) => instruction !== null);
    }
    return parsedInstructions.filter((instruction) => instruction !== null);
}
function parseMeteoraInstruction(transaction, instruction, hawksightAccount) {
    if (instruction.programId.toBase58() == dlmm_1.LBCLMM_PROGRAM_IDS["mainnet-beta"]) {
        try {
            if ("data" in instruction) {
                return getMeteoraInstructionData(transaction, instruction, hawksightAccount);
            }
        }
        catch (err) {
            console.error(err);
            throw new Error(`Failed to parse Meteora DLMM instruction on signature ${transaction.transaction.signatures[0]}`);
        }
    }
    return null;
}
function getMeteoraInstructionData(transaction, instruction, hawksightAccount) {
    const decodedInstruction = INSTRUCTION_CODER.decode(instruction.data, "base58");
    if (!transaction.blockTime) {
        throw new Error(`Transaction blockTime missing from signature ${transaction.transaction.signatures[0]}`);
    }
    if (!decodedInstruction || !INSTRUCTION_MAP.has(decodedInstruction.name)) {
        // Unknown instruction
        return null;
    }
    const index = (0, solana_transaction_utils_1.getInstructionIndex)(transaction, instruction);
    if (index == -1) {
        return null;
    }
    const instructionName = decodedInstruction.name;
    const instructionType = INSTRUCTION_MAP.get(decodedInstruction.name);
    const accountMetas = (0, solana_transaction_utils_1.getAccountMetas)(transaction, instruction);
    const accounts = getPositionAccounts(decodedInstruction, accountMetas, hawksightAccount);
    const tokenTransfers = !hawksightAccount
        ? (0, solana_transaction_utils_1.getTokenTransfers)(transaction, index)
        : (0, hawksight_parser_1.getHawksightTokenTransfers)(transaction, instruction, index);
    const activeBinId = tokenTransfers.length > 0 ? getActiveBinId(transaction, index) : null;
    const removalBps = instructionType == "remove" ? getRemovalBps(decodedInstruction) : null;
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
function getPositionAccounts(decodedInstruction, accountMetas, hawksightAccount) {
    try {
        const { accounts } = INSTRUCTION_CODER.format(decodedInstruction, accountMetas);
        const positionAccount = accounts.find((account) => account.name == "Position");
        const position = positionAccount.pubkey.toBase58();
        const lbPairAccount = accounts.find((account) => account.name == "Lb Pair");
        const lbPair = lbPairAccount.pubkey.toBase58();
        const senderAccount = accounts.find((account) => account.name == "Sender" || account.name == "Owner");
        const sender = hawksightAccount || senderAccount.pubkey.toBase58();
        return {
            position,
            lbPair,
            sender,
        };
    }
    catch (err) {
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
function getActiveBinId(transaction, index) {
    if (transaction.meta && transaction.meta.innerInstructions) {
        const parsedInnerInstruction = transaction.meta.innerInstructions.find((i) => i.index == index);
        if (parsedInnerInstruction && parsedInnerInstruction.instructions) {
            const instructions = parsedInnerInstruction.instructions;
            const meteoraInstructions = instructions.filter((instruction) => instruction.programId.toBase58() ==
                dlmm_1.LBCLMM_PROGRAM_IDS["mainnet-beta"]);
            const events = meteoraInstructions.map((instruction) => {
                const ixData = bytes_1.bs58.decode(instruction.data);
                // @ts-ignore
                const eventData = bytes_1.base64.encode(ixData.subarray(8));
                return EVENT_CODER.decode(eventData);
            });
            const eventWithActiveBinId = events.find((event) => event && "activeBinId" in event.data);
            return eventWithActiveBinId
                ? eventWithActiveBinId.data.activeBinId
                : null;
        }
    }
    return null;
}
function getRemovalBps(decodedInstruction) {
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
//# sourceMappingURL=meteora-instruction-parser.js.map