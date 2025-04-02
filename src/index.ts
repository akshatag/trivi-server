import express, { Request, Response } from 'express';
import cors from 'cors';
import './config';
import { pgpool } from './utils/db';

import challengesRoute from './routes/challenges';
import usersRoute from './routes/users';
import podsRoute from './routes/pods';
import teamsRoute from './routes/teams';
import analyticsRoute from './routes/analytics';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/challenges', challengesRoute);
app.use('/users', usersRoute);
app.use('/pods', podsRoute);
app.use('/teams', teamsRoute);
app.use('/analytics', analyticsRoute);

app.get('/', (req: Request, res: Response) => {
    res.send('API is running!');
});

app.post('/', (req: Request, res: Response) => {
    res.status(201).json({ message: 'Question set successfully!' });
});

process.on('SIGINT', async () => {
    console.log('Closing PostgreSQL pool...');
    await pgpool.end();
    console.log('PostgreSQL pool closed.');
    process.exit(0);
});

// Only start the server if we're running directly (not being imported)
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 8080;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// Export the Express app for Vercel
export default app;
