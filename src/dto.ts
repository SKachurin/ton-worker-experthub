import { z } from 'zod';

export const createBookingContractRequestSchema = z.object({
    booking_id: z.number().int().positive(),
    payment_id: z.number().int().positive(),
    customer_telegram_id: z.number().int().positive(),
    expert_telegram_id: z.number().int().positive(),
    customer_wallet: z.string().min(1),
    expert_wallet: z.string().min(1),
    amount_nano_ton: z.string().regex(/^\d+$/, 'amount_nano_ton must be a positive integer string'),
    slot_start_unix: z.number().int().positive(),
    expert_confirmation_deadline_unix: z.number().int().positive(),
    session_result_deadline_unix: z.number().int().positive()
});

export const contractActionRequestSchema = z.object({
    contract_address: z.string().min(1),
    payment_id: z.number().int().positive(),
    booking_id: z.number().int().positive(),
    action: z.string().min(1),
    reason: z.string().optional().nullable()
});

export type CreateBookingContractRequest = z.infer<typeof createBookingContractRequestSchema>;
export type ContractActionRequest = z.infer<typeof contractActionRequestSchema>;

export type CreateBookingContractResponse = {
    contract_address: string;
};

export type ContractActionResponse = {
    contract_address: string;
    action: string;
    ok: boolean;
};