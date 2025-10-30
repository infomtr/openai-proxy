import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/extract', async (req, res) => {
  const { statementText } = req.body;

  const prompt = `
Extract the following from the bank statement below:
1. Metadata: Statement Date, Date Range, Bank Name, Account Number, Owner Name
2. Transactions: Array of { Date, Description, Amount, DepositOrWithdrawal }

Return JSON with:
{
  "metadata": {
    "statementDate": "",
    "dateRange": "",
    "bankName": "",
    "accountNumber": "",
    "ownerName": ""
  },
  "transactions": [ ... ]
}

Statement:
"""${statementText}"""
`;

  try {
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    });

    res.json({ success: true, result: chatCompletion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

