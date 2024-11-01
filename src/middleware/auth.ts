import { Request, Response, NextFunction } from 'express';
import { supabase } from '../utils/supabase';

export const authenticateRequest = async(req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        if(!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ message: 'Authorization header missing or malformed' });
            return;
        }

        const token = authHeader!.split(' ')[1];

        const { data: tokenData, error } = await supabase.auth.getUser(token);

        if (error || !tokenData) {
            res.status(401).json({ message: 'Invalid or expired token' });
            return;
        }

        const { data: profileData, error: profileError } = await supabase.from('profiles').select('*').eq('id', tokenData.user.id).single();

        req.user = { ...tokenData.user, team_id: profileData?.team_id, pod_id: profileData?.pod_id, role: profileData?.role }; 
        next(); 
    } catch (error) {
        console.error('Error authenticating request:', error);
        res.status(500).json({ message: 'Internal server error' });
        return;
    }
}