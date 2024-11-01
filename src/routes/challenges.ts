import express, { Request, Response, RequestHandler } from 'express';
import { authenticateRequest } from '../middleware/auth';
import { supabase } from '../utils/supabase';
import { openai } from '../utils/openai';
import { pgpool } from '../utils/db';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const router = express.Router();

// Insert a challenge
router.post('/', authenticateRequest, async (req: Request, res: Response) => {

  if (req.user.role != 'TEAM_ADMIN') {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const { challenge_question, ideal_response, grading_criteria, challenge_date } = req.body;
  const team_id = req.user.team_id;

  const { error } = await supabase
    .from('challenges')
    .insert([{ challenge_question, ideal_response, grading_criteria, challenge_date, team_id }])
    .select();

  if (error) {
    console.error('Error inserting challenge:', error);
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(201).json({ message: 'Challenge set successfully!' });
});

// Update a challenge
router.put('/', authenticateRequest, async (req: Request, res: Response) => {

  if (req.user.role != 'TEAM_ADMIN') {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  console.log('PARAMS ' + JSON.stringify(req.body));

  const { challenge_id, challenge_question, ideal_response, grading_criteria, challenge_date } = req.body;

  const { error } = await supabase
    .from('challenges')
    .update([{ challenge_question, ideal_response, grading_criteria, challenge_date }])
    .eq('id', challenge_id)
    .eq('team_id', req.user.team_id)
    .select();

  if (error) {
    console.error('Error inserting challenge:', error);
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(201).json({ message: 'Challenge set successfully!' });
});

// Get challenges for a given date range
router.get('/questions', authenticateRequest, async (req: Request, res: Response) => {

  const { startDate, endDate } = req.query;
  if (typeof startDate !== 'string' || typeof endDate !== 'string') {
    res.status(400).json({ message: 'startDate and endDate are required and must be strings' });
    return;
  }

  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .gte('challenge_date', startDate)
    .lte('challenge_date', endDate)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error getting questions:', error);
    res.status(500).json({ message: error.message });
    return;
  }

  res.json(data);
})


router.get('/past', authenticateRequest, async (req: Request, res: Response) => {
  try {

    console.log('TEAM ID: ' + req.user.team_id);

    const data = await pgpool.query(`
      select * from
        (select id as challenge_id, challenge_question, challenge_date from challenges where challenge_date <= $1 AND team_id = $2 order by challenge_date desc) as challenges
        left join (
          select id as response_id, challenge_id as response_challenge_id, response_text, grade_score, grade_critique
          from responses
          where user_id = $3
  ) as responses on challenges.challenge_id = responses.response_challenge_id;
      `, [new Date().toISOString(), req.user.team_id, req.user.id]);

    res.json(data.rows);
    return;

  } catch (error) {
    console.error('Error getting scores:', error);
    res.status(500).json({ message: error });
    return;
  }
})

// Get the challenge of the day. Note, only the question is returned
router.get('/latest', authenticateRequest, async (req: Request, res: Response) => {

  const { data, error } = await supabase
    .from('challenges')
    .select('id, challenge_question, created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error getting today\'s challenge:', error);
    res.status(500).json({ message: error.message });
    return;
  }

  // If there are no challenges, return null
  if (data!.length === 0) {
    res.json(null);
    return;
  }

  // Otherwise, return the challenge
  res.json(data![0]);
});


// Get scores for a particular date range, or all time if no range is provided
router.get('/scores', authenticateRequest, async (req: Request, res: Response) => {
  let { startDate, endDate } = req.query;
  
  if(!startDate){
    startDate = '-infinity';
  }

  if(!endDate){
    endDate = 'infinity';
  }

  console.log('START DATE: ' + startDate);
  console.log('END DATE: ' + endDate);

  if (typeof startDate !== 'string' || typeof endDate !== 'string') {
    res.status(400).json({ message: 'startDate and endDate are required and must be strings' });
    return;
  }

  try {
    const data = await pgpool.query(`
      select
        summed_scores.*,
        profiles.email as email
      from
        (
          select
            sum(grade_score) as total_score,
            responses.user_id
          from
            responses
          where
            responses.created_at >= $1
            AND
            responses.created_at <= $2
          group by
            responses.user_id
        ) as summed_scores
        right join (
          select
            *
          from
            profiles
          where
            profiles.team_id = $3
            AND
            profiles.role = 'POD_MEMBER'
        ) as profiles on summed_scores.user_id = profiles.id
        order by total_score desc;
      `, [startDate, endDate, req.user.team_id]);

    res.json(data.rows);
    return;

  } catch (error) {
    console.error('Error getting scores:', error);
    res.status(500).json({ message: error });
    return;
  }
});

// Get scores by Podfor a particular date range, or all time if no range is provided
router.get('/scoresByPod', authenticateRequest, async (req: Request, res: Response) => {
  let { startDate, endDate } = req.query;
  
  if(!startDate){
    startDate = '-infinity';
  }

  if(!endDate){
    endDate = 'infinity';
  }

  console.log('START DATE: ' + startDate);
  console.log('END DATE: ' + endDate);

  if (typeof startDate !== 'string' || typeof endDate !== 'string') {
    res.status(400).json({ message: 'startDate and endDate are required and must be strings' });
    return;
  }

  try {
    const data = await pgpool.query(`
      select SUM(responses.grade_score) as total_score, MAX(pods.name) as pod_name, pods.id as pod_id from      
      ( select id, pod_id from profiles where team_id = $1 and role = 'POD_MEMBER') as profiles
      inner join 
      ( select id, name from pods where team_id = $1 ) as pods on profiles.pod_id = pods.id
      inner join 
      ( select user_id, grade_score from responses where created_at >= $2 AND created_at <= $3 ) as responses on profiles.id = responses.user_id
      group by pods.id      
      order by total_score desc
      `, [req.user.team_id, startDate, endDate]);

    res.json(data.rows);
    return;

  } catch (error) {
    console.error('Error getting scores:', error);
    res.status(500).json({ message: error });
    return;
  }
});







// Get users response to a particular chalenge_id
router.get('/responses/:challenge_id', authenticateRequest, async (req: Request, res: Response) => {

  console.log("PARAMS" + req.params.challenge_id);

  const { data, error } = await supabase
    .from('responses')
    .select('*')
    .eq('challenge_id', req.params.challenge_id)
    .eq('user_id', req.user.id)
    .limit(1);

  if (error) {
    console.error('Error getting the response:', error);
    res.status(500).json({ message: error.message });
  }

  res.json(data![0]);
});


// Get all the responses for a particular challenge from users in the same pod as the user
router.get('/responses/:challenge_id/all', authenticateRequest, async (req: Request, res: Response) => {

  if(req.user.role == 'POD_MEMBER'){
    try {
      const data = await pgpool.query(`
        select * from
        (select * from responses where challenge_id = $1) as responses
        right join
        (select * from profiles where team_id = $2 and pod_id = $3) as profiles
        on responses.user_id = profiles.id
      `, [req.params.challenge_id, req.user.team_id, req.user.pod_id]);

      res.json(data.rows);
      return;

    } catch (error) {
      console.error('Error getting scores:', error);
      res.status(500).json({ message: error });
      return;
    }

  }

  if(req.user.role == 'TEAM_ADMIN'){
    try {
      const data = await pgpool.query(`
        select * from 
        (select * from responses where challenge_id = $1) as responses
        right join
        (select * from profiles where team_id = $2 and role = 'POD_MEMBER') as profiles
        on responses.user_id = profiles.id
      `, [req.params.challenge_id, req.user.team_id]);

      res.json(data.rows);
      return;

    } catch (error) {
      console.error('Error getting scores:', error);
      res.status(500).json({ message: error });
      return;
    }
  }
});


// Submit a response to a challenge
router.post('/responses', authenticateRequest, async (req: Request, res: Response) => {
  const { challenge_id, response_text } = req.body;
  const user_id = req.user.id;

  const GradeResponseSchema = z.object({
    score: z.number(),
    critique: z.string()
  })

  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('id', challenge_id)
    .limit(1);

  if (error) {
    console.error('Error fetching challenge:', error);
    res.status(500).json({ message: error.message });
  }

  const prompt = `
      You are a technical sales coach. Look at the QUESTION below, the IDEAL_RESPONSE, and the GRADING_CRITERIA. Grade the SUBMITTED_RESPONSE based on the grading criteria. Provide both a SCORE and a CRITIQUE of the submitted response. The score should be a number from 0 to 10, with 10 being a perfect response. The critique should explain what the submitted response did well, what elements it was missing compared to the ideal response. The critique should not be about the response style or length - it should be focused on content only. The critique should be returned in paragraph form. 

      QUESTION: 
      ${data![0].challenge_question}

      IDEAL_RESPONSE: 
      ${data![0].ideal_response}
      
      GRADING CRITERIA: 
      ${data![0].grading_criteria}

      SUBMITTED_REPSONSE: 
      ${response_text}
    `

  const completion = await openai.beta.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      { role: "user", content: prompt },
    ],
    response_format: zodResponseFormat(GradeResponseSchema, "grade"),
  });

  const grade = completion.choices[0].message.parsed;

  const { error: insertError } = await supabase
    .from('responses')
    .insert([{ challenge_id, user_id, response_text, grade_score: grade?.score, grade_critique: grade?.critique }]);

  if (insertError) {
    console.error('Error inserting response:', error);
    res.status(500).json({ message: insertError.message });
  }

  res.status(201).json({ message: 'Response inserted successfully!', grade });
});


export default router;
