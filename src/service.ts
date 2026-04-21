import type {
    ContractActionRequest,
    ContractActionResponse,
    PrepareBookingContractRequest,
    PrepareBookingContractResponse
} from './dto';
import {
    createControllerWallet,
    createTonClient,
    loadBookingEscrowCode,
    parseAddress
} from './ton';
import { BookingEscrow, type BookingEscrowConfig } from '../wrappers/BookingEscrow';
import { beginCell, storeStateInit } from '@ton/core';

const DEFAULT_ACTION_GAS_NANO_TON = 50_000_000n;
const DEFAULT_DEPLOY_GAS_BUFFER_NANO_TON = 150_000_000n;

export class TonWorkerService {
    async prepareBookingContract(
        payload: PrepareBookingContractRequest
    ): Promise<PrepareBookingContractResponse> {
        const code = loadBookingEscrowCode();

        const escrowConfig: BookingEscrowConfig = {
            customerWallet: parseAddress(payload.customer_wallet),
            expertWallet: parseAddress(payload.expert_wallet),
            controllerWallet: config.controllerWallet,
            amountNanoTon: BigInt(payload.amount_nano_ton),

            bookingId: BigInt(payload.booking_id),
            expertTelegramId: BigInt(payload.expert_telegram_id),
            customerTelegramId: BigInt(payload.customer_telegram_id),

            slotStartUnix: BigInt(payload.slot_start_unix),
            expertConfirmationDeadlineUnix: BigInt(payload.expert_confirmation_deadline_unix),
            sessionOutcomeDeadlineUnix: BigInt(payload.session_outcome_deadline_unix)
        };

        const contract = BookingEscrow.createFromConfig(escrowConfig, code);

        if (!contract.init) {
            throw new Error('Contract init is missing');
        }

        const stateInitBoc = beginCell()
            .store(storeStateInit(contract.init))
            .endCell()
            .toBoc()
            .toString('base64');

        const escrowAmount = BigInt(payload.amount_nano_ton);
        const totalDeployValue = escrowAmount + DEFAULT_DEPLOY_GAS_BUFFER_NANO_TON;

        return {
            contract_address: contract.address.toString(),
            state_init_boc: stateInitBoc,
            amount_nano_ton: totalDeployValue.toString(),
            recommended_gas_buffer_nano_ton: DEFAULT_DEPLOY_GAS_BUFFER_NANO_TON.toString(),
            total_deploy_value_nano_ton: totalDeployValue.toString()
        };
    }

    async sendContractAction(
        payload: ContractActionRequest
    ): Promise<ContractActionResponse> {
        const client = await createTonClient();
        const controller = await createControllerWallet(client);

        const address = parseAddress(payload.contract_address);
        const provider = client.provider(address);
        const contract = new BookingEscrow(address);

        switch (payload.action) {
            case 'expert_confirm':
                await contract.sendExpertConfirm(
                    provider,
                    controller.sender,
                    DEFAULT_ACTION_GAS_NANO_TON
                );
                break;

            case 'expert_decline':
                await contract.sendExpertDecline(
                    provider,
                    controller.sender,
                    DEFAULT_ACTION_GAS_NANO_TON
                );
                break;

            case 'session_connected':
            case 'customer_no_show':
                await contract.sendFinalizeToExpert(
                    provider,
                    controller.sender,
                    DEFAULT_ACTION_GAS_NANO_TON
                );
                break;

            case 'expert_no_show':
                await contract.sendRefundToCustomer(
                    provider,
                    controller.sender,
                    DEFAULT_ACTION_GAS_NANO_TON
                );
                break;

            case 'set_customer_rating':
                if (!payload.rating) {
                    throw new Error('rating is required for set_customer_rating');
                }

                await contract.sendSetCustomerRating(
                    provider,
                    controller.sender,
                    DEFAULT_ACTION_GAS_NANO_TON,
                    payload.rating
                );
                break;

            case 'set_expert_rating':
                if (!payload.rating) {
                    throw new Error('rating is required for set_expert_rating');
                }

                await contract.sendSetExpertRating(
                    provider,
                    controller.sender,
                    DEFAULT_ACTION_GAS_NANO_TON,
                    payload.rating
                );
                break;

            default:
                throw new Error(`Unsupported action: ${payload.action}`);
        }

        return {
            contract_address: payload.contract_address,
            action: payload.action,
            ok: true
        };
    }
}