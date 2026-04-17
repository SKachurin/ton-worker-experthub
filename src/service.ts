import crypto from 'node:crypto';
import type {
    ContractActionRequest,
    ContractActionResponse,
    CreateBookingContractRequest,
    CreateBookingContractResponse
} from './dto.js';

export class TonWorkerService {
    async deployBookingContract(
        payload: CreateBookingContractRequest
    ): Promise<CreateBookingContractResponse> {
        const syntheticAddress = this.buildFakeContractAddress(payload);

        console.log('[ton-worker] deployBookingContract stub', {
            booking_id: payload.booking_id,
            payment_id: payload.payment_id,
            customer_telegram_id: payload.customer_telegram_id,
            expert_telegram_id: payload.expert_telegram_id,
            customer_wallet: payload.customer_wallet,
            expert_wallet: payload.expert_wallet,
            amount_nano_ton: payload.amount_nano_ton,
            contract_address: syntheticAddress
        });

        return {
            contract_address: syntheticAddress
        };
    }

    async sendContractAction(
        payload: ContractActionRequest
    ): Promise<ContractActionResponse> {
        console.log('[ton-worker] sendContractAction stub', payload);

        return {
            contract_address: payload.contract_address,
            action: payload.action,
            ok: true
        };
    }

    private buildFakeContractAddress(payload: CreateBookingContractRequest): string {
        const hash = crypto
            .createHash('sha256')
            .update(
                [
                    payload.booking_id,
                    payload.payment_id,
                    payload.customer_telegram_id,
                    payload.expert_telegram_id,
                    payload.amount_nano_ton,
                    payload.slot_start_unix
                ].join(':')
            )
            .digest('hex')
            .slice(0, 48);

        return `testnet_stub_${hash}`;
    }
}