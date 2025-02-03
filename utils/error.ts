export const OpenBookErrors: Record<number, string> = {
    100: 'Cannot close the OpenOrders indexer because there are still active OpenOrders accounts.',
    101: 'Name length above limit.',
    102: 'Market cannot be created as expired.',
    103: 'Invalid market fees configuration.',
    104: 'Lots cannot be negative.',
    105: 'Lots size above market limits.',
    106: 'Input amounts above limits.',
    107: 'Price lots should be greater than zero.',
    108: 'Expected cancel size should be greater than zero.',
    109: 'Peg limit should be greater than zero.',
    110: 'Invalid order type. Taker order must be Market or ImmediateOrCancel.',
    111: 'Order ID cannot be zero.',
    112: 'Slot above heap limit.',
    113: 'Cannot combine two oracles of different providers.',
    114: 'Cannot configure secondary oracle without primary.',
    150: 'Market cannot be closed because it has active orders.',
    200: 'Market has already expired.',
    201: 'Market has not expired yet.',
    202: 'Invalid market vault provided.',
    250: 'No correct owner or delegate.',
    251: 'No correct owner.',
    252: 'No free order index in OpenOrders account.',
    300: 'Oracle peg orders are not enabled for this market.',
    301: 'Oracle price above market limits.',
    302: 'Order ID not found on orderbook.',
    303: 'Would self-trade.',
    304: 'Fill-Or-Kill order would generate a partial execution.',
    // Add more OpenBook error codes as needed
  };
  
  /**
   * Translates OpenBook error codes into human-readable error messages.
   * @param errorCode The error code returned from OpenBook
   * @returns A user-friendly error message
   */
  export function getOpenBookErrorMessage(errorCode: number): string {
    return OpenBookErrors[errorCode] || `Unknown OpenBook error: ${errorCode}`;
  }
  