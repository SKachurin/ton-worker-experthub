import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

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
    tonNetwork: process.env.TON_NETWORK?.trim() || 'testnet',
    tonEndpoint: requireEnv('TON_RPC_ENDPOINT'),
    tonApiKey: process.env.TON_API_KEY?.trim() || '',
    controllerMnemonic: requireEnv('TON_CONTROLLER_MNEMONIC'),
    bookingEscrowArtifactPath:
        process.env.BOOKING_ESCROW_ARTIFACT_PATH?.trim() || 'build/BookingEscrow.compiled.json'
};