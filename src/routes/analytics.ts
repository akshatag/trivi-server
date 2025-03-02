import express, { Request, Response } from 'express';
import { authenticateRequest } from '../middleware/auth';
import { pgpool } from '../utils/db';

const router = express.Router();
// recommit
// Get response rates for all users in the team over the last 30 days
router.get('/response-rates/users', authenticateRequest, async (req: Request, res: Response) => {

  try {
    const data = await pgpool.query(`
      WITH user_stats AS (
        SELECT 
          p.id as user_id,
          p.email,
          COUNT(DISTINCT c.id) as total_challenges,
          COUNT(DISTINCT r.id) as total_responses
        FROM 
          profiles p
          LEFT JOIN challenges c ON c.team_id = p.team_id 
            AND c.challenge_date >= NOW() - INTERVAL '30 days'
            AND c.challenge_date <= NOW()
          LEFT JOIN responses r ON r.user_id = p.id 
            AND r.challenge_id = c.id
        WHERE 
          p.role = 'POD_MEMBER'
        GROUP BY 
          p.id, p.email
      )
      SELECT 
        user_id,
        email,
        total_challenges,
        total_responses,
        CASE 
          WHEN total_challenges = 0 THEN 0
          ELSE ROUND((total_responses::decimal / total_challenges::decimal) * 100, 2)
        END as response_rate
      FROM 
        user_stats
      ORDER BY 
        response_rate DESC;
    `);

    res.json(data.rows);
  } catch (error) {
    console.error('Error getting user response rates:', error);
    res.status(500).json({ message: error });
  }
});

// Get response rates by pod over the last 30 days
router.get('/response-rates/pods', authenticateRequest, async (req: Request, res: Response) => {
  try {
    const data = await pgpool.query(`
      WITH pod_stats AS (
        SELECT 
          pod.id as pod_id,
          pod.name as pod_name,
          COUNT(c.id) as total_challenges,
          COUNT(DISTINCT r.id) as total_responses
        FROM 
          pods pod
          LEFT JOIN profiles p ON p.pod_id = pod.id 
            AND p.role = 'POD_MEMBER'
          LEFT JOIN challenges c ON c.team_id = pod.team_id 
            AND c.challenge_date >= NOW() - INTERVAL '30 days'
            AND c.challenge_date <= NOW()
          LEFT JOIN responses r ON r.user_id = p.id 
            AND r.challenge_id = c.id
        GROUP BY 
          pod.id, pod.name
      )
      SELECT 
        pod_id,
        pod_name,
        total_challenges,
        total_responses,
        CASE 
          WHEN total_challenges = 0 THEN 0
          ELSE ROUND((total_responses::decimal / total_challenges::decimal) * 100, 2)
        END as response_rate
      FROM 
        pod_stats
      ORDER BY 
        response_rate DESC;
    `);

    res.json(data.rows);
  } catch (error) {
    console.error('Error getting pod response rates:', error);
    res.status(500).json({ message: error });
  }
});

export default router;
