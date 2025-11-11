// server.js 
require('dotenv').config();
const express = require('express');
const { Sequelize, Op } = require('sequelize');
const path = require('path');
const app = express();
const port = 3000;

// Require db.js
const db = require('./db/database');
const { PeriodConsolidated, DailyData, PeriodConsolidatedByAccount } = db; // Added DailyData

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API to get periods for a type (all if no dates)
app.get('/api/periods/:type', async (req, res) => {
  const { type } = req.params;
  const { startDate, endDate } = req.query;
  const wallet = process.env.CARTEIRA_2 || 'default_wallet';

  try {
    let where = { wallet, periodType: type };


    const periods = await PeriodConsolidated.findAll({
      where,
      order: [['periodIdentifier', 'ASC']],
    });

    console.log(`Returned ${periods.length} periods for ${type}`);
    res.json(periods);
  } catch (error) {
    console.error(`Error fetching periods for ${type}:`, error);
    res.status(500).json({ error: 'Failed to fetch periods.' });
  }
});

// Get daily data (all if no dates)
app.get('/api/daily', async (req, res) => {
  const { startDate, endDate } = req.query;
  const wallet = process.env.CARTEIRA_2 || 'default_wallet';
  try {
    let where = { wallet };
    if (startDate && endDate) {
      where.data = { [Op.between]: [startDate, endDate] };
    }
    const daily = await DailyData.findAll({
      where,
      order: [['id', 'ASC']],
    });
    console.log(`Returned ${daily.length} daily records`);
    res.json(daily);
  } catch (error) {
    console.error(`Error fetching daily data:`, error);
    res.status(500).json({ error: 'Failed to fetch daily data.' });
  }
});

// API: resumo por conta
app.get('/api/accounts-summary', async (req, res) => {
  const wallet = process.env.CARTEIRA_2 || 'default_wallet';
  try {
    const data = await PeriodConsolidatedByAccount.findAll({
      where: { wallet, periodType: 'mensal' },
      attributes: [
        'conta',
        [Sequelize.fn('SUM', Sequelize.col('percentual')), 'percentualTotal'],
        [Sequelize.fn('SUM', Sequelize.col('lucroTotal')), 'lucroTotal']
      ],
      group: ['conta'],
      raw: true
    });

    console.log(`Returned ${data.length} account summaries`);
    res.json(data);
  } catch (error) {
    console.error('Error fetching account summary:', error);
    res.status(500).json({ error: 'Failed to fetch account summary.' });
  }
});


// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});