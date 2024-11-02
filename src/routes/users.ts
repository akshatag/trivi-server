import express, { Request, Response, RequestHandler } from 'express';
import { authenticateRequest } from '../middleware/auth';
import { supabase } from '../utils/supabase';
import { pgpool } from '../utils/db';


const router = express.Router();

// Create a new user when the user first signs up. Just expects a session object in the request
router.post('/init', async (req: Request, res: Response) => {
  const email = req.body.email;
  const domain = email.split('@')[1];

  const { data:teamData, error: teamError } = await supabase
    .from('teams')
    .select('*')    
    .eq('domain', domain)
    .maybeSingle();

  if (teamError) {
    console.error('Error fetching team:', teamError);
    res.status(500).json({ message: teamError.message });
    return;
  }

  if (!teamData) {
    res.status(404).json({ message: 'Team not found' });
    return;
  }

  let userData;

  try {
    userData = await pgpool.query(`
        select * from auth.users where email = $1;
    `, [email])
    
    userData = userData.rows[0];
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ message: error });
    return;
  }

  if (!userData) {
    res.status(404).json({ message: 'User already exists' });
    return;
  } 

  console.log('id: ' + userData.id);
  console.log('email: ' + userData.email);
  console.log('teamId: ' + teamData.id);

  // TODO: if there aren't other users in the team, set the role to 'TEAM_ADMIN'
  const { data: insertData, error: insertError } = await supabase
    .from('profiles')
    .insert([{ id: userData.id, email: email, team_id: teamData.id, role: 'POD_MEMBER', name: email.split('@')[0] }]);

  if (insertError) {
    console.error('Error inserting user:', insertError);
    res.status(500).json({ message: insertError.message });
    return;
  } else {
    res.status(201).json({ message: 'User created successfully!' });
    return;
  }


});


// Update a user
router.put('/', authenticateRequest, async (req: Request, res: Response) => {

  let updateParams: any = {}

  if (req.body.name) { 
    updateParams['name'] = req.body.name;
  }

  if (req.body.role) { 
    updateParams['role'] = req.body.role;
  }

  if (req.body.pod_id) { 
    updateParams['pod_id'] = req.body.pod_id;
  }

  if (req.body.onboarding_complete) { 
    updateParams['onboarding_complete'] = req.body.onboarding_complete;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updateParams)
    .eq('id', req.user.id);

  if (error) {
    console.error('Error inserting user:', error);
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(200).json({ message: 'User updated successfully!' });
  return;
});



// Get user profile information
router.get('/', authenticateRequest, async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: error.message });
    return;
  }

  res.json(data);
});


// Get user profile information
router.get('/all', authenticateRequest, async (req: Request, res: Response) => {

  if (req.user.role != 'TEAM_ADMIN') {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const data = await pgpool.query(`
        SELECT 
          profiles.*,
          users.email as email,
          pods.name as pod_name
        FROM (
          SELECT * FROM profiles WHERE profiles.team_id = $1) AS profiles
        LEFT JOIN pods ON profiles.pod_id = pods.id
        LEFT JOIN auth.users on profiles.id = users.id; 
    `, [req.user.team_id]);

    res.json(data.rows);
    return;

  } catch (error) {
    console.error('Error getting scores:', error);
    res.status(500).json({ message: error });
    return;
  }
});

// Update user profile
router.post('/profile', authenticateRequest, async (req: Request, res: Response) => {
  const { name, pod_id } = req.body;
  const user_id = req.user.id;

  const { error } = await supabase
    .from('profiles')
    .update({ name, pod_id })
    .eq('id', user_id);

  if (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(200).json({ message: 'Profile updated successfully!' });
  return;
});

// Update user role
router.post('/role', authenticateRequest, async (req: Request, res: Response) => {

  if (req.user.role != 'TEAM_ADMIN') {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const targetUserId = req.body.target_user_id;
  const targetRole = req.body.target_role;

  if(!['TEAM_ADMIN', 'POD_MEMBER'].includes(targetRole)) {
    res.status(400).json({ message: 'Invalid role' });
    return;
  }

  console.log('targetUserId: ' + targetUserId);
  console.log('targetRole: ' + targetRole);

  const { data, error } = await supabase
    .from('profiles')
    .update({ role: targetRole })
    .eq('team_id', req.user.team_id)
    .eq('id', targetUserId);

  if (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(201).json({ message: 'Role update successful!' });
  return;

});

// Update user pod
router.post('/pod', authenticateRequest, async (req: Request, res: Response) => {

  if (req.user.role != 'TEAM_ADMIN') {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const targetUserId = req.body.target_user_id;
  const targetPodId = req.body.target_pod_id;

  console.log('targetUserId: ' + targetUserId);
  console.log('targetPod: ' + targetPodId);

  const { data, error } = await supabase
    .from('profiles')
    .update({ pod_id: targetPodId })
    .eq('team_id', req.user.team_id)
    .eq('id', targetUserId);

  if (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(201).json({ message: 'Pod update successful!' });
  return;
});






export default router;
