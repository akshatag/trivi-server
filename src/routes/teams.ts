import express, { Request, Response, RequestHandler } from 'express';
import { authenticateRequest } from '../middleware/auth';
import { supabase } from '../utils/supabase';
import { pgpool } from '../utils/db';


const router = express.Router();

// Check if the domain the user is trying to join with exists
router.get('/:domain', authenticateRequest,async (req: Request, res: Response) => {
    const domain = req.params.domain;

    const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('domain', domain)
        .single();

    if(data) {
        res.status(200).json(data);
        return;
    } else {
        res.status(200).json(null);
        return;
    }
});




export default router;
