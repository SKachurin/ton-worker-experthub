import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value || !value.trim()) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value.trim();
}

export const config = {
    port: Number(process.env.PORT || 8081),
    authToken: process.env.TON_WORKER_AUTH_TOKEN?.trim() || '',
    tonEndpoint: requireEnv('TON_RPC_ENDPOINT'),
    tonApiKey: process.env.TON_API_KEY?.trim() || '',
    controllerMnemonic: requireEnv('TON_CONTROLLER_MNEMONIC'),
    bookingEscrowCodeBoc: requireEnv('BOOKING_ESCROW_CODE_BOC')
};