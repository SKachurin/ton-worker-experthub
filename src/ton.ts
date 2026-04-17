import { mnemonicToWalletKey } from '@ton/crypto';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { Address, Cell } from '@ton/core';
import { config } from './config.js';

export async function createTonClient(): Promise<TonClient> {
    return new TonClient({
        endpoint: config.tonEndpoint,
        apiKey: config.tonApiKey || undefined
    });
}

export async function createControllerWallet(client: TonClient) {
    const mnemonic = config.controllerMnemonic.split(/\s+/).filter(Boolean);
    const keyPair = await mnemonicToWalletKey(mnemonic);

    const wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey
    });

    const openedWallet = client.open(wallet);

    return {
        address: wallet.address,
        sender: openedWallet.sender(keyPair.secretKey),
        openedWallet
    };
}

export function parseAddress(value: string): Address {
    return Address.parse(value);
}

export function loadContractCodeFromEnv(): Cell {
    return Cell.fromBase64(config.bookingEscrowCodeBoc);
}