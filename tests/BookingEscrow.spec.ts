import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { BookingEscrow } from '../wrappers/BookingEscrow';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('BookingEscrow', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('BookingEscrow');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let bookingEscrow: SandboxContract<BookingEscrow>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        bookingEscrow = blockchain.openContract(BookingEscrow.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await bookingEscrow.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: bookingEscrow.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and bookingEscrow are ready to use
    });
});
