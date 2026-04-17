import type {
    ContractActionRequest,
    ContractActionResponse,
    PrepareBookingContractRequest,
    PrepareBookingContractResponse
} from './dto.js';
import { createTonClient, createControllerWallet, loadContractCodeFromEnv, parseAddress } from './ton.js';
import { BookingEscrow, type BookingEscrowConfig } from '../wrappers/BookingEscrow.js';

export class TonWorkerService {
    async prepareBookingContract(
        payload: PrepareBookingContractRequest
    ): Promise<PrepareBookingContractResponse> {
        const code = loadContractCodeFromEnv();

        const escrowConfig: BookingEscrowConfig = {
            customerWallet: parseAddress(payload.customer_wallet),
            expertWallet: parseAddress(payload.expert_wallet),
            controllerWallet: parseAddress(payload.controller_wallet),
            amountNanoTon: BigInt(payload.amount_nano_ton),
            bookingId: BigInt(payload.booking_id),
            expertTelegramId: BigInt(payload.expert_telegram_id),
            customerTelegramId: BigInt(payload.customer_telegram_id),
            slotStartUnix: BigInt(payload.slot_start_unix),
            expertConfirmationDeadlineUnix: BigInt(payload.expert_confirmation_deadline_unix),
            sessionOutcomeDeadlineUnix: BigInt(payload.session_outcome_deadline_unix)
        };

        const contract = BookingEscrow.createFromConfig(escrowConfig, code);

        return {
            contract_address: contract.address.toString(),
            state_init_boc: contract.createStateInitBoc(),
            amount_nano_ton: payload.amount_nano_ton
        };
    }

    async sendContractAction(
        payload: ContractActionRequest
    ): Promise<ContractActionResponse> {
        const client = await createTonClient();
        const controller = await createControllerWallet(client);

        const contract = client.open(new BookingEscrow(parseAddress(payload.contract_address)));

        if (payload.action === 'expert_confirm') {
            await contract.sendExpertConfirm(controller.sender, 50_000_000n);
        } else if (payload.action === 'expert_decline') {
            await contract.sendExpertDecline(controller.sender, 50_000_000n);
        } else if (payload.action === 'session_connected' || payload.action === 'customer_no_show') {
            await contract.sendFinalizeToExpert(controller.sender, 50_000_000n);
        } else if (payload.action === 'expert_no_show') {
            await contract.sendRefundToCustomer(controller.sender, 50_000_000n);
        } else {
            throw new Error(`Unsupported action: ${payload.action}`);
        }

        return {
            contract_address: payload.contract_address,
            action: payload.action,
            ok: true
        };
    }
}