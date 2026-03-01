/**
 * Inter-Bot Signal Bus
 *
 * A lightweight in-process signal queue that lets the Sniper Bot and the
 * Vault Bot communicate without coupling their modules directly together.
 *
 * Signal flow:
 *   Sniper Bot  ──(PROFIT_REALIZED)──►  Vault Bot  ──(VAULT_DEPOSIT_DONE)──►  log
 *
 * All signals are stored in a ring-buffer so they can be inspected via the
 * /api/signals endpoint and displayed in both bot UIs.
 */

export const SignalType = {
    /** Sniper Bot emits this after a profitable sell. Vault Bot auto-deposits the ETH. */
    PROFIT_REALIZED: 'PROFIT_REALIZED',
    /** Vault Bot emits this after successfully depositing a profit signal. */
    VAULT_DEPOSIT_DONE: 'VAULT_DEPOSIT_DONE',
    /** Vault Bot emits this when a deposit attempt fails. */
    VAULT_DEPOSIT_FAILED: 'VAULT_DEPOSIT_FAILED'
};

const MAX_SIGNALS = 200;

/** @type {{ id: number, ts: string, type: string, data: object, consumed: boolean }[]} */
const signalQueue = [];
let nextId = 1;

/**
 * Post a signal onto the bus.
 *
 * @param {string} type  One of SignalType.*
 * @param {object} data  Arbitrary payload.
 */
export function postSignal(type, data = {}) {
    signalQueue.unshift({
        id: nextId++,
        ts: new Date().toISOString(),
        type,
        data,
        consumed: false
    });
    if (signalQueue.length > MAX_SIGNALS) signalQueue.length = MAX_SIGNALS;
}

/**
 * Drain all unconsumed signals of a given type, marking them consumed.
 *
 * @param {string} type
 * @returns {{ id: number, ts: string, type: string, data: object }[]}
 */
export function drainSignals(type) {
    const pending = signalQueue.filter((s) => !s.consumed && s.type === type);
    pending.forEach((s) => { s.consumed = true; });
    return pending;
}

/**
 * Return the most-recent signals (all types, consumed or not) for display.
 *
 * @param {number} [limit=50]
 * @returns {{ id: number, ts: string, type: string, data: object, consumed: boolean }[]}
 */
export function getRecentSignals(limit = 50) {
    return signalQueue.slice(0, limit);
}
