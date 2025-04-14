import express, { Request, Response, RequestHandler } from 'express';
import { authenticateRequest } from '../middleware/auth';
import { supabase } from '../utils/supabase';
import { pgpool } from '../utils/db';


const router = express.Router();

// Check if the domain the user is trying to join with exists
router.get('/:domain', async (req: Request, res: Response) => {
    const domain = req.params.domain.trim();

    console.log('Checking domain:', domain);

    const { data, error } = await supabase
        .from('teams')
        .select('*')
        .filter('domain', 'ilike', `%${domain}%`);

    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }

    if (!data || data.length === 0) {
        res.status(200).json(null);
        return;
    }

    res.status(200).json(data[0]);
});




export default router;
