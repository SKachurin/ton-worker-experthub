import fs from 'node:fs';
import path from 'node:path';
import { mnemonicToWalletKey } from '@ton/crypto';
import { Address, Cell } from '@ton/core';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { config } from './config';

type BlueprintArtifact = {
    hex?: string;
};

export async function createTonClient(): Promise<TonClient> {
    return new TonClient({
        endpoint: config.tonEndpoint,
        apiKey: config.tonApiKey || undefined
    });
}

export async function createControllerWallet(client: TonClient) {
    const mnemonic = config.controllerMnemonic.split(/\s+/).filter(Boolean);

    if (mnemonic.length !== 24) {
        throw new Error('TON_CONTROLLER_MNEMONIC must contain exactly 24 words');
    }

    const keyPair = await mnemonicToWalletKey(mnemonic);

    const wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey
    });

    const openedWallet = client.open(wallet);

    return {
        address: wallet.address,
        sender: openedWallet.sender(keyPair.secretKey)
    };
}

export function parseAddress(value: string): Address {
    return Address.parse(value);
}

export function loadBookingEscrowCode(): Cell {
    const artifactPath = path.resolve(process.cwd(), config.bookingEscrowArtifactPath);

    if (!fs.existsSync(artifactPath)) {
        throw new Error(
            `BookingEscrow artifact not found at ${artifactPath}. Build it first with Blueprint.`
        );
    }

    const raw = fs.readFileSync(artifactPath, 'utf8');
    const artifact = JSON.parse(raw) as BlueprintArtifact;

    if (!artifact.hex || !artifact.hex.trim()) {
        throw new Error(`Artifact ${artifactPath} does not contain a valid hex field`);
    }

    return Cell.fromHex(artifact.hex.trim());
}