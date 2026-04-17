import dotenv from 'dotenv';
import express, { type Request, type Response, type NextFunction } from 'express';
import {
    contractActionRequestSchema,
    createBookingContractRequestSchema
} from './dto.js';
import { TonWorkerService } from './service.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8081);
const authToken = process.env.TON_WORKER_AUTH_TOKEN || '';

const service = new TonWorkerService();

app.use(express.json());

function requireInternalAuth(req: Request, res: Response, next: NextFunction): void {
    if (!authToken) {
        next();
        return;
    }

    const incoming = req.header('x-ton-worker-token');
    if (incoming !== authToken) {
        res.status(401).json({
            error: 'unauthorized'
        });
        return;
    }

    next();
}

app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'ton-worker',
        network: process.env.TON_NETWORK || 'unknown'
    });
});

app.post('/contracts/deploy-booking', requireInternalAuth, async (req, res) => {
    const parsed = createBookingContractRequestSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({
            error: 'invalid payload',
            details: parsed.error.flatten()
        });
        return;
    }

    try {
        const response = await service.deployBookingContract(parsed.data);
        res.json(response);
    } catch (error) {
        console.error('[ton-worker] deploy-booking failed', error);

        res.status(500).json({
            error: error instanceof Error ? error.message : 'internal error'
        });
    }
});

app.post('/contracts/:address/action', requireInternalAuth, async (req, res) => {
    const mergedBody = {
        ...req.body,
        contract_address: req.params.address
    };

    const parsed = contractActionRequestSchema.safeParse(mergedBody);

    if (!parsed.success) {
        res.status(400).json({
            error: 'invalid payload',
            details: parsed.error.flatten()
        });
        return;
    }

    try {
        const response = await service.sendContractAction(parsed.data);
        res.json(response);
    } catch (error) {
        console.error('[ton-worker] contract action failed', error);

        res.status(500).json({
            error: error instanceof Error ? error.message : 'internal error'
        });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`[ton-worker] listening on 0.0.0.0:${port}`);
});