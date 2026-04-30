import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config';
import { contractActionRequestSchema, prepareBookingContractRequestSchema } from './dto';
import { TonWorkerService } from './service';

const app = express();
const service = new TonWorkerService();

app.use(express.json());

function requireInternalAuth(req: Request, res: Response, next: NextFunction): void {
    if (!config.authToken) {
        next();
        return;
    }

    const incoming = req.header('x-ton-worker-token');
    if (incoming !== config.authToken) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }

    next();
}

app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'ton-worker',
        network: config.tonNetwork
    });
});

app.post('/contracts/prepare-booking', requireInternalAuth, async (req, res) => {
    const parsed = prepareBookingContractRequestSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({
            error: 'invalid payload',
            details: parsed.error.flatten()
        });
        return;
    }

    try {
        const result = await service.prepareBookingContract(parsed.data);
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'internal error'
        });
    }
});

app.post('/contracts/:address/action', requireInternalAuth, async (req, res) => {
    const parsed = contractActionRequestSchema.safeParse({
        ...req.body,
        contract_address: req.params.address
    });

    if (!parsed.success) {
        res.status(400).json({
            error: 'invalid payload',
            details: parsed.error.flatten()
        });
        return;
    }

    try {
        const result = await service.sendContractAction(parsed.data);
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'internal error'
        });
    }
});

app.get('/contracts/:address/state', requireInternalAuth, async (req, res) => {
    try {
        const address = String(req.params.address);
        const result = await service.getBookingContractState(address);
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'internal error'
        });
    }
});

app.listen(config.port, '0.0.0.0', () => {
    console.log(`ton-worker listening on ${config.port}`);
});