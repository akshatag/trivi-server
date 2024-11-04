import express, { Request, Response, RequestHandler } from 'express';
import { authenticateRequest } from '../middleware/auth';
import { supabase } from '../utils/supabase';
import { pgpool } from '../utils/db';


const router = express.Router();


// Get list of all pods in the user's team
router.get('/all', authenticateRequest, async (req: Request, res: Response) => {
  try {
    const data = await pgpool.query(`
        SELECT 
          *
        FROM
          pods
        WHERE
          pods.team_id = $1
    `, [req.user.team_id]);

    res.json(data.rows);
    return;

  } catch (error) {
    console.error('Error getting pods:', error);
    res.status(500).json({ message: error });
    return;
  }
});



// Add a pod
router.post('/', authenticateRequest, async (req: Request, res: Response) => {
  if (req.user.role != 'TEAM_ADMIN') {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const { data, error } = await supabase
  .from('pods')
  .insert({ name: req.body.pod_name, team_id: req.user.team_id })
  .select();

  if (error) {
    console.error('Error creating pod:', error);
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(200).json({ message: 'Pod created successfully!' });
  return; 
});




// Update a pod
router.put('/', authenticateRequest, async (req: Request, res: Response) => {

    if (req.user.role != 'TEAM_ADMIN') {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { data, error } = await supabase
    .from('pods')
    .update({ name: req.body.pod_name })
    .eq('team_id', req.user.team_id)
    .eq('id', req.body.pod_id);

    if (error) {
      console.error('Error updating pod:', error);
      res.status(500).json({ message: error.message });
      return;
    }

    res.status(201).json({ message: 'Pod updated successfully!' });
    return; 
  });


export default router;
