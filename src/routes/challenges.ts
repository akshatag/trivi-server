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

  const { challenge_id, challenge_question, ideal_response, grading_criteria } = req.body;

  const { error } = await supabase
    .from('challenges')
    .update([{ challenge_question, ideal_response, grading_criteria }])
    .eq('id', challenge_id)
    .eq('team_id', req.user.team_id)
    .select();

  if (error) {
    console.error('Error updating challenge:', error);
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(201).json({ message: 'Challenge updated successfully!' });
});

// Delete a challenge
router.delete('/:challengeId', authenticateRequest, async (req: Request, res: Response) => {

  if (req.user.role !== 'TEAM_ADMIN') {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const challengeId = req.params.challengeId;

  const { error } = await supabase
    .from('challenges')
    .delete()
    .eq('id', challengeId)
    .eq('team_id', req.user.team_id)

  if (error) {
    console.error('Error deleting challenge:', error);
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(200).json({ message: 'Challenge deleted successfully!' });
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
    .order('challenge_date', { ascending: false })

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
        (select id as challenge_id, challenge_question, grading_criteria, challenge_date, ideal_response from challenges where challenge_date <= $1 AND team_id = $2 order by challenge_date desc) as challenges
        left join (
          select id as response_id, challenge_id as response_challenge_id, response_text, grade_score, grade_critique, started_at as response_started_at
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

  if (!startDate) {
    startDate = '-infinity';
  }

  if (!endDate) {
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

  if (!startDate) {
    startDate = '-infinity';
  }

  if (!endDate) {
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
      select AVG(responses.grade_score) as total_score, MAX(pods.name) as pod_name, pods.id as pod_id from      
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


// Get list of users who have not submitted a response to a challenge
router.get('/responses/:challenge_id/nonresponders', authenticateRequest, async (req: Request, res: Response) => {

  if (req.user.role == 'POD_MEMBER') {
    try {
      const data = await pgpool.query(`
        select * from
        (select * from responses where challenge_id = $1) as responses
        right join
        (select * from profiles where team_id = $2 and pod_id = $3) as profiles
        on responses.user_id = profiles.id
        where responses.user_id is null
      `, [req.params.challenge_id, req.user.team_id, req.user.pod_id]);

      res.json(data.rows);
      return;

    } catch (error) {
      console.error('Error getting scores:', error);
      res.status(500).json({ message: error });
      return;
    }

  }

  if (req.user.role == 'TEAM_ADMIN') {
    try {
      const data = await pgpool.query(`
        select * from 
        (select * from responses where challenge_id = $1) as responses
        right join
        (select * from profiles where team_id = $2 and role = 'POD_MEMBER') as profiles
        on responses.user_id = profiles.id
        where responses.user_id is null
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


// Get all the responses for a particular challenge from users in the same pod as the user
router.get('/responses/:challenge_id/all', authenticateRequest, async (req: Request, res: Response) => {

  if (req.user.role == 'POD_MEMBER') {
    try {
      const data = await pgpool.query(`
        select * from
        (select * from responses where challenge_id = $1) as responses
        inner join
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

  if (req.user.role == 'TEAM_ADMIN') {
    try {
      const data = await pgpool.query(`
        select * from 
        (select * from responses where challenge_id = $1) as responses
        inner join
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


// Init a response to a challenge
router.post('/responses/init', authenticateRequest, async (req: Request, res: Response) => {
  const { challenge_id, response_text } = req.body;
  const user_id = req.user.id;

  const { data: existingResponse, error: existingResponseError } = await supabase
    .from('responses')
    .select('*')
    .eq('challenge_id', challenge_id)
    .eq('user_id', user_id)

  if (existingResponseError) {
    console.error('Error checking if user already has a response:', existingResponseError);
    res.status(500).json({ message: existingResponseError.message });
    return;
  }

  if (existingResponse.length > 0) {
    res.status(400).json({ message: 'You already have a response to this challenge' });
    return;
  }

  const { data, error } = await supabase
    .from('responses')
    .insert({ challenge_id, user_id, response_text })

  if (error) {
    console.error('Error fetching challenge:', error);
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(200).json({ message: "Response initialized!" })
  return;
})


// Submit a response to a challenge
router.put('/responses', authenticateRequest, async (req: Request, res: Response) => {
  const { challenge_id, response_text, score, critique } = req.body;
  const user_id = req.user.id;

  const { error: insertError } = await supabase
    .from('responses')
    .update([{ response_text, grade_score: score, grade_critique: critique }])
    .eq('challenge_id', challenge_id)
    .eq('user_id', user_id);

  if (insertError) {
    console.error('Error inserting response:', insertError);
    res.status(500).json({ message: insertError.message });
    return;
  }

  res.status(201).json({ message: 'Response inserted successfully!' });
  return;
});



// Test a response to a challenge
router.post('/responses/test', authenticateRequest, async (req: Request, res: Response) => {

  if (req.user.role != 'TEAM_ADMIN') {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }


  const { challenge_question, ideal_response, grading_criteria, test_response } = req.body;

  const GradeResponseSchema = z.object({
    score: z.number(),
    critique: z.string()
  })

  const systemPrompt = `
      You are a technical sales coach. Given a QUESTION, an IDEAL RESPONSE, a GRADING CRITERIA, and a USER REPSONSE, your job is to provide a SCORE and a CRITIQUE. Note that some of the GRADING CRITERIA are marked as [CRITICAL] meaning they should be weighted more heavily. Others are marked as [BONUS] which means they should be weighted less heavily. Based on how well the USER RESPONSE meets the GRADING CRITERIA, produce a SCORE. The SCORE should be a number from 0 to 10, with 10 being the perfect response that meets all the GRADING CRITERIA. Finally, write a CRITIQUE of the USER RESPONSE. Make sure this CRITIQUE is conversational, like a mentor to a mentee. Address the user as "you" in the CRITIQUE. Go over what the user did well first. Then explain what elements the user was missing compared to the IDEAL RESPONSE. The CRITIQUE should not take the USER RESPONSE style into account -- it should be focused on the content only. 

      Use the example below as a guide.

      --------

      EXAMPLE QUESTION:
      Suppose a customer asks you, "What model does Codeium use?". This customer is also considering using Github Copilot. How would you respond to this? 

      EXAMPLE IDEAL RESPONSE: 
      Codeium offers a combination of models that we have trained or fine-tuned in-house as well as third-party models. We even allow you to bring your own OpenAI compatible endpoint. Our philosophy is that we are not dogmatic about the models you use; we want to make sure you have access to the best model for each specific task. For autocomplete, for instance, we believe our in-house model is state of the art. We have trained it from the ground up specifically for the autocomplete use case, focusing on low-latency and capabilities like inline-FIM. For Chat, on the other hand, we give you the ability to choose between our in-house and third party models.

      Given how quickly the space moves, model optionality is critical to make sure that you always have access to the best tools for each task. This gives you the confidence that now and into the future, you'll get access to the best models through Codeium. Note, Github Copilot only just introduced support for non-OpenAI models, validating the need for model optionality. Copilot still doesn't support bringing your own endpoint. Codeium continues to be a leader in this area. 

      EXAMPLE GRADING CRITERIA: 
      - [CRITICAL] Automatic 0 if they talked about the number of parameters in our in-house model. Avoid talking about model size. 
      - Identified that Codeium offers a combination of models trained in-house and third-party models. 
      - [BONUS] Mentioned the capability to bring your own endpoint.
      - Talked about Codeium's model philosophy: the best model for each specific task
      - Talked about offering in-house models where we believe we have the state of the art, such as autocomplete.
      - [BONUS] Explained that our autocomplete is state of the art because of low-latency and capabilities like inline-FIM. 
      - Talked about the latest models that Codeium supports - GPT-4o, Claude 3.5, GPT-o1
      - Talked about the so what: avoiding the risk of model lock-in and futureproofing their decision to go with Codeium. 
      - [CRITICAL] Acknowledged that Github Copilot also recently introduced support for non-OpenAI models, but framed Codeium as the leader in this area. 

      --------

      EXAMPLE USER RESPONSE #1: 
      Codeium uses our own in-house models for autocomplete and can connect to OpenAI and Anthropic as well. Our goal is to make sure that you always have the best models available for each specific task. 

      EXAMPLE SCORE #1: 3

      EXAMPLE CRITIQUE #1: 
      Good job explaining our model philosophy! And you are correct that Codeium offers a combination of models that we have trained or fine-tuned in-house as well as third-party models (not just OpenAI and Anthropic models). We even allow you to bring your own OpenAI compatible endpoint.

      But you didn't talk about the "so what?" for the customer. It's important to explain why we have in-house models. In the case of autocomplete, our in-house model is state of the art. We have trained it from the ground up specifically for the autocomplete use case, focusing on low-latency and capabilities like inline-FIM. The reason its important that we support third party models is well is to avoid model lock-in given how quickly the space moves. Furthermore, now that Github Copilot also introduced support for non-OpenAI models, it's important to emphasize that Codeium was the first to introduce support for third party models. And, we remain a leader in this space with the ability to bring your own endpoint. 

      --------

      EXAMPLE USER RESPONSE #2: 
      Codeium offers both in-house models and third party models. We believe that you should have the best model for each specific task. For some tasks, like autocomplete, we believe our in-house model is state of the art. For others, like Chat, we allow you to choose between our in-house and third party models, such as GPT-4o and Claude 3.5.

      This is critical given how quickly the space moves. With Codeium, you have the confidence that you will have access to the best model. Github recently introduced support for non-OpenAI models, validating the need for model optionality. But Codeium was the first in this space.

      EXAMPLE SCORE #2: 8

      EXAMPLE CRITIQUE #2: 
      Great job explaining our model philosophy and why model optionality is important. You also captured that we have both in-house models and third-party models. 

      When talking about our in-house models, its worth explaining why we believe our in-house model is state of the art. We believe our autcomplete model's low-latency and inline-FIM capabilities make it better than anything else on the market. Another thing you missed is that we allow customers to bring their own endpoint. This shows our continued leadership in this space. 

      --------

      EXAMPLE USER RESPONSE #3: 
      Codeium offers a combination of models that we have trained or fine-tuned in-house as well as third-party models. Our philosophy is that we are not dogmatic about the models you use; we want to make sure you have access to the best model for each specific task. For autocomplete, for instance, we believe our in-house model is state of the art. Our autocomplete model is 10B parameters. We have trained it from the ground up specifically for the autocomplete use case, focusing on low-latency and capabilities like inline-FIM. For Chat, on the other hand, we give you the ability to choose between our in-house and third party models.

      Given how quickly the space moves, model optionality is critical to make sure that you always have access to the best tools for each task. This gives you the confidence that now and into the future, you'll get access to the best models through Codeium. Note, Github Copilot only just introduced support for non-OpenAI models, validating the need for model optionality. 

      EXAMPLE SCORE #3: 0

      EXAMPLE CRITIQUE #3: 
      Remember never to mention the size or parameter count of our models. This is a critical mistake and the reason your response received a 0. Otherwise, you did a good job of explaining our model philosophy and the different models on our platform. You also did a good job of explaining why our in-house autocomplete model is state of the art. You also correctly identified that Copilot now offers non-OpenAI models. 

      One thing you missed was that we allow customers to bring their own endpoint. This shows our continued leadership in this space.

      --------
    `

  const userPrompt = `
      Now based on that example, provide a score and a critique for the following user response based on the question, ideal response, and grading criteria provided. 

      QUESTION: 
      ${challenge_question}

      IDEAL RESPONSE: 
      ${ideal_response}
      
      GRADING CRITERIA: 
      ${grading_criteria}

      USER REPSONSE: 
      ${test_response}
    `

  try {
    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: zodResponseFormat(GradeResponseSchema, "grade"),
    });

    const grade = completion.choices[0].message.parsed;

    res.status(200).json({ grade });
    return;
  } catch (error) {
    res.status(500).json({ message: 'Error testing response:', error });
    return;
  }

});



// Infer criteria from ideal response
router.post('/criteria/infer', authenticateRequest, async (req: Request, res: Response) => {

  if (req.user.role != 'TEAM_ADMIN') {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const { challenge_question, ideal_response } = req.body;

  const systemPrompt = `
      Infer CRITERIA based on the QUESTION and the IDEAL RESPONSE. Refer to the examples below. 

      --------

      EXAMPLE QUESTION:
      Suppose a customer stores their code on Github. How would you respond to the objection that, because of that fact, Codeium and Copilot have the same context-awareness. 

      EXAMPLE IDEA LRESPONSE: 
      Even though the customer may store their code on Github, Codeium's context awareness engine is superior for the following reasons. Firstly, Codeium is able to leverage context from not only local but also remote repositories. If the customer is on Github Copilot Business, they can only index a limited number of remote repositories. Second, though both Codeium and Copilot may have access to the same information, simply having access to information isn't enough to produce personalized results. The system must deeply understand your codebase. Codeium does this through its proprietary context awareness engine, which uses custom code parsers to build detailed syntax trees of every file in your remote and local repos. We also use sophisticated retrieval techniques over and above basic RAG to make sure that the most relevant context is fetched. 

      INFERRED GRADING CRITERIA: 
      - Acknowledges that because customer code is stored on Github, so Codeium and Github Copilot will have access to the same repositories
      - Identifies the caveat that Copilot Business customers will have limited remote repositories
      - Draws the distinction between having access to your codebase and deeply understandding
      - Makes the case that Codeium has a superior context awareness engine.
      - Uses custom code parsers and smart RAG techniques as evidence.

      --------

      EXAMPLE QUESTION:
      Why did we build the Windsurf Editor? What does this mean for Enterprise customers? 

      EXAMPLE IDEAL RESPONSE: 
      We realized that in order to provide the best AI-native coding experience, we needed to own the underlying IDE. Today, we are reliant on the APIs that VSCode and JetBrains and such provide to us. This inherently limits how creative we can be. This is especially important as we launch AI Flows like Cascade and Supercomplete, which are new paradigms for human-AI interaction. Thus, we decided to invest in  building the Windsurf Editor. 

      This doesn’t change our commitment to supporting the existing IDEs that Enterprises know and love. Tech stack compatibility is one of Codeium’s core strengths, and the team will continue to bring new features to the other IDEs. However, new features — like Cascade — will land on the Windsurf Editor first given that is the surface we have the most control over. 

      INFERRED GRADING CRITERIA: 
      - Identifies that we are limited by VS Code and JetBrains APIs
      - Identifies that human-AI interactions will change with the introduction of AI Flows
      - Identifies that the Windsurf Editor will give us control so we can deliver the best AI-native coding experience
      - Notes that Codeium will continue to support the other IDEs and that it remains committed to tech stack compatibility
      - Notes that new features will land on Windsurf first and then on other IDEs

      --------

      EXAMPLE QUESTION:
      What are AI Flows? How are they different from agents? 

      EXAMPLE IDEAL RESPONSE: 
      AI Flows, like Supercomplete and Cascade, are a new class of capabilities. If you think about most Copilots today, such as Autocomplete and Chat, these are the result of combining large language models with context-awareness. Agents build on this baseline by introducing the use of "tools" -- the ability for the model to actually write code, edit code, etc. Flows are the next evolution of Agents. In addition to tools and context, they give models a deep understanding of human intent. 

      Flows offer the best of both Copilots and Agents. They can be collaborative like Copilots and yet also execute certain tasks autonomously. By understanding what you are trying to do, they can be proactive rather than reactive (think Supercomplete). 

      INFERRED GRADING CRITERIA: 
      - Identifies that AI Flows are a new class of capabilities altogether, distinct from Copilots and Agents.
      - Identifies Supercomplete and Cascade as the two new AI Flows. 
      - Explains that Copilots only had access to models and context
      - Explains that Agents built on Copilots with Tool use
      - Gives a few examples of "tools" such as the ability to write and edit code
      - Explains that Flows build on Agents and Copilots by adding an understanding of human intent
      - Explains that their understanding of human intent allows Flows to deliver the best of both Copilot and Agents, being autonomous at times and collaborative at times. 

      --------
    `

  const userPrompt = `
      Now based on that example, provide a grading criteria based on the quesiton and ideal response. 

      QUESTION: 
      ${challenge_question}

      IDEAL RESPONSE: 
      ${ideal_response}
      
      GRADING CRITERIA: 
    `

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const criteria = completion.choices[0].message;

    res.status(200).json({ criteria });
    return;
  } catch (error) {
    res.status(500).json({ message: 'Error inferring criteria:', error });
    return;
  }

});


// Convert criteria from from natural language to a structured format
router.post('/criteria/convert', authenticateRequest, async (req: Request, res: Response) => {

  const { grading_criteria } = req.body;

  const GradeCriterion = z.object({
    points: z.number(),
    text: z.string()
  })

  const GradeCriteria = z.object({
    criteria: z.array(GradeCriterion)
  })

  const systemPrompt = `
      Convert the grading criteria (input) from natural language to a structured format (output). Note, if a criteria does not have a point value, set it to 1 point. See the example below: 

      --------

      EXAMPLE INPUT:
      - [3] Acknowledges that because customer code is stored on Github, so Codeium and Github Copilot will have access to the same repositories
      - 2pt: Identifies the caveat that Copilot Business customers will have limited remote repositories
      - Draws the distinction between having access to your codebase and deeply understandding
      - 1 point - Makes the case that Codeium has a superior context awareness engine.
      - [2 points] Uses custom code parsers and smart RAG techniques as evidence.

      EXAMPLE OUTPUT: 
      [
        {
          "points": 3,
          "text": "Acknowledges that because customer code is stored on Github, so Codeium and Github Copilot will have access to the same repositories"
        },
        {
          "points": 2,
          "text": "Identifies the caveat that Copilot Business customers will have limited remote repositories"
        },
        {
          "points": 1,
          "text": "Draws the distinction between having access to your codebase and deeply understandding"
        },
        {
          "points": 1,
          "text": "Makes the case that Codeium has a superior context awareness engine."
        },
        {
          "points": 2,
          "text": "Uses custom code parsers and smart RAG techniques as evidence."
        }
      ]
    `

  const userPrompt = `
      Now based on that example, parse the grading criteria below into a structured format. 

      GRADING CRITERIA: 
      ${grading_criteria}
    `

  try {
    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: zodResponseFormat(GradeCriteria, "criteria"),
    });

    const criteria = completion.choices[0].message.parsed;
    res.status(200).json({ criteria });
    return;
  } catch (error) {
    console.error('Error inferring criteria:', error);
    res.status(500).json({ message: 'Error testing response:', error });
    return;
  }

});


router.post('/criteria/grade', authenticateRequest, async (req: Request, res: Response) => {


  const { question, response, points, criterion } = req.body;

  const Grade = z.object({
    score: z.number(),
    critique: z.string()
  })

  const systemPrompt = `
      Given a question, a user response, a grading criterion, and a points value, return a score and a critique in a structured format.

      The score should be a number from 0 to the points value. It should be decided based on how well the user response addresses the grading criterion. The critique should be a short, 1-2 sentence explanation of areas the user could improve. The critique should not reference the criterion and it should address the user as "you" in the critique.

      --------

      EXAMPLE QUESTION:
      Suppose a customer asks you, "What model does Codeium use?". This customer is also considering using Github Copilot. How would you respond to this? 

      EXAMPLE USER RESPONSE: 
      Codeium uses our own in-house models for autocomplete and can connect to OpenAI and Anthropic as well. Our goal is to make sure that you always have the best models available for each specific task.  

      EXAMPLE GRADING CRITERION: 
      Explains Codeium's model philosophy: the best model for each specific task and identified that Codeium offers a combination of models trained in-house and third-party models. Mentioned the capability to bring your own endpoint.

      EXAMPLE POINT VALUE: 
      3

      EXAMPLE OUTPUT:
      {
        "score": 2,
        "critique": "You could have also mentioned the capability to bring your own endpoint."
      }
    `

  const userPrompt = `
      Grade the User Response based on the question, grading criterion, and points value.

      QUESTION: 
      ${question}

      USER RESPONSE: 
      ${response}

      GRADING CRITERION: 
      ${criterion}

      POINT VALUE: 
      ${points}
    `

  try {
    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: zodResponseFormat(Grade, "grade"),
    });

    const grade = completion.choices[0].message.parsed;
    res.status(200).json({ grade });
    return;
  } catch (error) {
    console.error('Error inferring criteria:', error);
    res.status(500).json({ message: 'Error testing response:', error });
    return;
  }



})

router.post('/critique/humanize', async (req: Request, res: Response) => {


  const { critiques } = req.body;

  const systemPrompt = `
      You are a technical sales coach. Given the series of critiques, write a short and conversational response that addresses what the user did well and what elements the user was missing. Do not reference the critiques or the criterion in your response. Address the user as "you". 

      Use the example below as a guide.    
  
      --------

      EXAMPLE CRITIQUES:
      The user response mentions being limited by VS Code's API limitations but does not reference JetBrains APIs. Therefore, it partially meets the criterion.
      The response clearly identifies that building the Windsurf Editor gives control to deliver the best AI-native coding experience by addressing the limitations of VS Code's API. This aligns with the grading criterion.
      The response discusses the reasons for building the Windsurf Editor and its benefits for Enterprise customers and mentions that new features will land on Windsurf first and then on other IDEs, which is the specific grading criterion.
      The response explains the reasoning behind building the Windsurf Editor and its benefits to enterprise customers and mentions Codeium's continued support for other IDEs or commitment to tech stack compatibility.
      The response addresses how human-AI interactions will change with the introduction of AI Flows. It does not mention building the Windsurf Editor as a more robust interface for leveraging Codeium's capabilities and the benefits it brings to Enterprise customers and the open-source community.

      EXAMPLE RESPONSE: 
      Great job explaining that Windsurf will enabled Codeium to deliver the best AI-native coding experience by getting around the API limitations on VS Code and Jetbrains. However, you could have brought up AI Flows an example of a new AI-native coding experience. Also, you could have also mentioned that Codeium remains committed to supporting the existing IDEs, though features may land on Windsurf first.  
    `

  const userPrompt = `
      Based on the example, humanize the following critique:

      CRITIQUES:
      ${critiques}
    `

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-2024-08-06",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
  
      const critique = completion.choices[0].message;
  
      res.status(200).json({ critique });
      return;
    } catch (error) {
      res.status(500).json({ message: 'Error inferring criteria:', error });
      return;
    }
})







export default router;
