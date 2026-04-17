import { z } from 'zod';

export const prepareBookingContractRequestSchema = z.object({
    booking_id: z.number().int().positive(),
    payment_id: z.number().int().positive(),
    customer_telegram_id: z.number().int().positive(),
    expert_telegram_id: z.number().int().positive(),
    customer_wallet: z.string().min(1),
    expert_wallet: z.string().min(1),
    controller_wallet: z.string().min(1),
    amount_nano_ton: z.string().regex(/^\d+$/, 'amount_nano_ton must be an integer string'),
    slot_start_unix: z.number().int().positive(),
    expert_confirmation_deadline_unix: z.number().int().positive(),
    session_outcome_deadline_unix: z.number().int().positive()
});

export const contractActionRequestSchema = z.object({
    contract_address: z.string().min(1),
    payment_id: z.number().int().positive(),
    booking_id: z.number().int().positive(),
    action: z.enum([
        'expert_confirm',
        'expert_decline',
        'session_connected',
        'customer_no_show',
        'expert_no_show'
    ]),
    reason: z.string().optional().nullable()
});

export type PrepareBookingContractRequest = z.infer<typeof prepareBookingContractRequestSchema>;
export type ContractActionRequest = z.infer<typeof contractActionRequestSchema>;

export type PrepareBookingContractResponse = {
    contract_address: string;
    state_init_boc: string;
    amount_nano_ton: string;
};

export type ContractActionResponse = {
    contract_address: string;
    action: string;
    ok: boolean;
};