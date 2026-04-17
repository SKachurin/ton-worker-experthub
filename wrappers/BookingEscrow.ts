import {
    Address,
    beginCell,
    Cell,
    contractAddress,
    Contract,
    ContractProvider,
    Sender,
    SendMode,
    StateInit
} from '@ton/core';

export const OP_EXPERT_CONFIRM = 0x1001;
export const OP_EXPERT_DECLINE = 0x1002;
export const OP_FINALIZE_TO_EXPERT = 0x1003;
export const OP_REFUND_TO_CUSTOMER = 0x1004;

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
    return beginCell()
        .storeAddress(config.customerWallet)
        .storeAddress(config.expertWallet)
        .storeAddress(config.controllerWallet)
        .storeCoins(config.amountNanoTon)
        .storeUint(config.bookingId, 64)
        .storeUint(config.expertTelegramId, 64)
        .storeUint(config.customerTelegramId, 64)
        .storeUint(config.slotStartUnix, 64)
        .storeUint(config.expertConfirmationDeadlineUnix, 64)
        .storeUint(config.sessionOutcomeDeadlineUnix, 64)
        .storeUint(0, 8)
        .endCell();
}

export class BookingEscrow implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: StateInit
    ) {}

    static createFromConfig(config: BookingEscrowConfig, code: Cell, workchain = 0): BookingEscrow {
        const data = bookingEscrowConfigToCell(config);
        const init = { code, data };
        return new BookingEscrow(contractAddress(workchain, init), init);
    }

    createStateInitBoc(): string {
        if (!this.init) {
            throw new Error('Contract init is missing');
        }

        return beginCell()
            .store(storeStateInit(this.init))
            .endCell()
            .toBoc()
            .toString('base64');
    }

    async sendExpertConfirm(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(OP_EXPERT_CONFIRM, 32).endCell()
        });
    }

    async sendExpertDecline(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(OP_EXPERT_DECLINE, 32).endCell()
        });
    }

    async sendFinalizeToExpert(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(OP_FINALIZE_TO_EXPERT, 32).endCell()
        });
    }

    async sendRefundToCustomer(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(OP_REFUND_TO_CUSTOMER, 32).endCell()
        });
    }
}

function storeStateInit(src: StateInit) {
    return (builder: ReturnType<typeof beginCell>) => {
        builder.storeBit(false);
        builder.storeBit(true);
        builder.storeRef(src.code);
        builder.storeBit(true);
        builder.storeRef(src.data);
        builder.storeBit(false);
    };
}