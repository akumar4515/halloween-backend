import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import epornerRoutes from './routes/eporner.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Halloween backend API is running' });
});

// API routes
app.use('/api/eporner', epornerRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${PORT}`);
});

