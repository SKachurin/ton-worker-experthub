import {
    Address,
    beginCell,
    Cell,
    contractAddress,
    Contract,
    ContractProvider,
    Sender,
    SendMode
} from '@ton/core';

export type BookingEscrowConfig = {
    customerWallet: Address;
    expertWallet: Address;
    controllerWallet: Address;
    amountNanoTon: bigint;

    bookingId: bigint;
    expertTelegramId: bigint;
    customerTelegramId: bigint;

    slotStartUnix: bigint;
    expertConfirmationDeadlineUnix: bigint;
    sessionOutcomeDeadlineUnix: bigint;
};

export function bookingEscrowConfigToCell(config: BookingEscrowConfig): Cell {
    const partiesCell = beginCell()
        .storeAddress(config.customerWallet)
        .storeAddress(config.expertWallet)
        .storeAddress(config.controllerWallet)
        .endCell();

    const metaCell = beginCell()
        .storeUint(config.bookingId, 64)
        .storeUint(config.expertTelegramId, 64)
        .storeUint(config.customerTelegramId, 64)
        .storeUint(config.slotStartUnix, 64)
        .storeUint(config.expertConfirmationDeadlineUnix, 64)
        .storeUint(config.sessionOutcomeDeadlineUnix, 64)
        .endCell();

    return beginCell()
        .storeCoins(config.amountNanoTon)
        .storeUint(0, 8)   // state = STATE_AWAITING_FUNDING
        .storeUint(0, 64)  // fundedAtUnix
        .storeUint(0, 64)  // finalizedAtUnix
        .storeUint(0, 8)   // customerRatingForExpert
        .storeUint(0, 8)   // expertRatingForCustomer
        .storeRef(partiesCell)
        .storeRef(metaCell)
        .endCell();
}

export class BookingEscrow implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new BookingEscrow(address);
    }

    static createFromConfig(config: BookingEscrowConfig, code: Cell, workchain = 0) {
        const data = bookingEscrowConfigToCell(config);
        const init = { code, data };
        return new BookingEscrow(contractAddress(workchain, init), init);
    }

    async getState(provider: ContractProvider): Promise<number> {
        const result = await provider.get('getState', []);
        return result.stack.readNumber();
    }

    async getAmountNanoTon(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('getAmountNanoTon', []);
        return result.stack.readBigNumber();
    }

    async getBookingId(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('getBookingId', []);
        return result.stack.readBigNumber();
    }

    async sendExpertConfirm(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x1001, 32).endCell()
        });
    }

    async sendExpertDecline(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x1002, 32).endCell()
        });
    }

    async sendFinalizeToExpert(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x1003, 32).endCell()
        });
    }

    async sendRefundToCustomer(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x1004, 32).endCell()
        });
    }

    async sendSetCustomerRating(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        rating: number
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x2001, 32)
                .storeUint(rating, 8)
                .endCell()
        });
    }

    async sendSetExpertRating(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        rating: number
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x2002, 32)
                .storeUint(rating, 8)
                .endCell()
        });
    }
}